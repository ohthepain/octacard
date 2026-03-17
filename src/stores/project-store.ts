/**
 * Project store: metadata + stacks. Replaces project-metadata-store and multi-sample-store.
 * Uses zundo for undo/redo; state is synced to Liveblocks.
 * Persisted to localStorage so project survives refresh.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { temporal } from "zundo";
import { useShallow } from "zustand/react/shallow";
import { parseBpmFromString } from "@/lib/tempoUtils";
import type { StackData } from "@/lib/project-document";

/** When true, state changes (e.g. from remote sync) are not added to undo history. */
let skipHistoryForHydrate = false;

/** When true, state changes (e.g. from updateSampleBars) are not added to undo history. */
let skipHistoryForUpdateSampleBars = false;

/** When true, state changes (e.g. from undo/redo restore) are not added to undo history. */
let skipHistoryForUndoRedo = false;

export function setSkipHistoryForHydrate(value: boolean): void {
  skipHistoryForHydrate = value;
}

export function setSkipHistoryForUpdateSampleBars(value: boolean): void {
  skipHistoryForUpdateSampleBars = value;
}

export function setSkipHistoryForUndoRedo(value: boolean): void {
  skipHistoryForUndoRedo = value;
}

export type PreviewMode = "single" | "multi";

export type PaneType = "source" | "dest";

export interface StackSample {
  id: string;
  path: string;
  name: string;
  paneType: PaneType;
  bars?: number;
  bpm?: number;
  duration?: number;
  volume?: number;
  muted?: boolean;
}

export interface ProjectStackState {
  id: string;
  name: string;
  sortOrder: number;
  slots: (StackSample | null)[];
  activeSlotIndex: number;
  previewMode: PreviewMode;
  bpmAuto: boolean;
  globalTempoBpm: number;
}

export interface PlayingSamplePosition {
  sampleId: string;
  currentTime: number;
}

export type PlayingSamplePositions = Record<string, number>;

export const SLOT_ROW_SIZE = 4;

/** Stable empty arrays for selectors to avoid "getSnapshot should be cached" infinite loops */
export const EMPTY_SLOTS: (StackSample | null)[] = [];
export const EMPTY_STACK: StackSample[] = [];

const DEFAULT_BPM = 120;

function getBpmFromSample(name: string, path: string): number {
  const fromName = parseBpmFromString(name);
  if (fromName) return fromName.bpm;
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const parentFolder = parts[parts.length - 2];
    const fromFolder = parentFolder ? parseBpmFromString(parentFolder) : null;
    if (fromFolder) return fromFolder.bpm;
  }
  return DEFAULT_BPM;
}

function slotsToStack(slots: (StackSample | null)[]): StackSample[] {
  return slots.filter((s): s is StackSample => s != null);
}

function chunkSlots(slots: (StackSample | null)[]): (StackSample | null)[][] {
  const rows: (StackSample | null)[][] = [];
  for (let i = 0; i < slots.length; i += SLOT_ROW_SIZE) {
    rows.push(slots.slice(i, i + SLOT_ROW_SIZE));
  }
  return rows;
}

function createDefaultStack(): ProjectStackState {
  return {
    id: crypto.randomUUID(),
    name: "Stack 1",
    sortOrder: 0,
    slots: Array.from({ length: SLOT_ROW_SIZE }, () => null),
    activeSlotIndex: 0,
    previewMode: "single",
    bpmAuto: true,
    globalTempoBpm: DEFAULT_BPM,
  };
}

interface ProjectState {
  // Metadata
  id: string | null;
  name: string;
  coverImageS3Key: string | null;
  coverImageUrl: string | null;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;

  // Stacks
  stacks: ProjectStackState[];
  activeStackId: string | null;

  // Playback UI (transient)
  playingSamplePosition: PlayingSamplePosition | null;
  playingSamplePositions: PlayingSamplePositions;

  // Metadata actions
  setMetadata: (meta: {
    id: string;
    name: string;
    coverImageS3Key?: string | null;
    coverImageUrl?: string | null;
    createdAt: number;
    updatedAt: number;
    isPublic: boolean;
  }) => void;
  setName: (name: string) => void;
  setCoverImage: (coverImageS3Key: string | null, coverImageUrl: string | null) => void;
  setIsPublic: (isPublic: boolean) => void;

  // Stack actions (operate on active stack)
  setPreviewMode: (mode: PreviewMode) => void;
  setBpmAuto: (enabled: boolean) => void;
  setPlayingSamplePosition: (pos: PlayingSamplePosition | null) => void;
  setPlayingSamplePositions: (positions: PlayingSamplePositions) => void;
  setActiveSlotIndex: (index: number) => void;
  putSampleInActiveSlot: (sample: { path: string; name: string; paneType: PaneType }) => void;
  addToStack: (sample: { path: string; name: string; paneType: PaneType }) => void;
  addSamplesToStack: (samples: Array<{ path: string; name: string; paneType: PaneType }>, maxCount?: number) => void;
  addSlotRow: () => void;
  addSlotRowAt: (rowIndex: number) => void;
  removeSlotRow: (rowIndex: number) => void;
  moveSlotRow: (fromRowIndex: number, toRowIndex: number) => void;
  replaceSampleAt: (index: number, sample: { path: string; name: string; paneType: PaneType }) => void;
  removeFromStack: (index: number) => void;
  clearSlot: (index: number) => void;
  updateSampleBars: (index: number, bars: number, duration: number, bpm?: number) => void;
  setGlobalTempoBpm: (bpm: number) => void;
  setSampleVolume: (index: number, volume: number) => void;
  setSampleMuted: (index: number, muted: boolean) => void;

  hydrateFromProject: (data: { stacks: StackData[]; activeStackId: string | null }) => void;

  getActiveStack: () => ProjectStackState | null;
  getActiveStackStack: () => StackSample[];
  /** Reset active stack slots to empty (for tests) */
  resetActiveStackSlots: () => void;

  clear: () => void;
}

const metadataInitial = {
  id: null as string | null,
  name: "Untitled",
  coverImageS3Key: null as string | null,
  coverImageUrl: null as string | null,
  createdAt: 0,
  updatedAt: 0,
  isPublic: false,
};

function updateActiveStack(
  state: ProjectState,
  updater: (stack: ProjectStackState) => Partial<ProjectStackState>,
): Partial<ProjectState> {
  const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
  if (!active) return {};
  const idx = state.stacks.findIndex((s) => s.id === active.id);
  if (idx < 0) return {};
  const updated = { ...active, ...updater(active) };
  const newStacks = [...state.stacks];
  newStacks[idx] = updated;
  return { stacks: newStacks };
}

/** State fields tracked for undo/redo (excludes transient playback and actions) */
function partializeProjectState(state: ProjectState): Partial<ProjectState> {
  return {
    id: state.id,
    name: state.name,
    coverImageS3Key: state.coverImageS3Key,
    coverImageUrl: state.coverImageUrl,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    isPublic: state.isPublic,
    stacks: state.stacks,
    activeStackId: state.activeStackId,
  };
}

export const useProjectStore = create<ProjectState>()(
  temporal(
    persist(
      (set, get) => ({
        ...metadataInitial,
        stacks: [createDefaultStack()],
        activeStackId: null,
        playingSamplePosition: null,
        playingSamplePositions: {},

        setMetadata: (meta) =>
          set((_state) => ({
              id: meta.id,
              name: meta.name,
              coverImageS3Key: meta.coverImageS3Key ?? null,
              coverImageUrl: meta.coverImageUrl ?? null,
              createdAt: meta.createdAt,
              updatedAt: meta.updatedAt,
              isPublic: meta.isPublic,
            })),

        setName: (name) => set({ name }),
        setCoverImage: (coverImageS3Key, coverImageUrl) => set({ coverImageS3Key, coverImageUrl }),
        setIsPublic: (isPublic) => set({ isPublic }),

        setPreviewMode: (mode) => set((s) => updateActiveStack(s, () => ({ previewMode: mode }))),
        setBpmAuto: (enabled) => set((s) => updateActiveStack(s, () => ({ bpmAuto: enabled }))),
        setPlayingSamplePosition: (pos) => set({ playingSamplePosition: pos }),
        setPlayingSamplePositions: (positions) => set({ playingSamplePositions: positions }),

        setActiveSlotIndex: (index) =>
          set((state) => {
            const out = updateActiveStack(state, (stack) => ({
              activeSlotIndex: Math.max(0, Math.min(index, stack.slots.length - 1)),
            }));
            return out;
          }),

        putSampleInActiveSlot: (sample) =>
          set((state) => {
            const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
            if (!active) return {};
            const bpm = getBpmFromSample(sample.name, sample.path);
            const newSample: StackSample = { id: crypto.randomUUID(), ...sample, bpm };
            const newSlots = [...active.slots];
            newSlots[active.activeSlotIndex] = newSample;
            const newStack = slotsToStack(newSlots);
            const newTempo = active.bpmAuto && newStack.length === 1 ? bpm : active.globalTempoBpm;
            return updateActiveStack(state, () => ({
              slots: newSlots,
              globalTempoBpm: newTempo,
            }));
          }),

        addToStack: (sample) =>
          set((state) => {
            const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
            if (!active) return {};
            const bpm = getBpmFromSample(sample.name, sample.path);
            const newSample: StackSample = { id: crypto.randomUUID(), ...sample, bpm };
            const newSlots = [...active.slots];
            newSlots[active.activeSlotIndex] = newSample;
            const newStack = slotsToStack(newSlots);
            const newTempo = active.bpmAuto && newStack.length === 1 ? bpm : active.globalTempoBpm;
            return updateActiveStack(state, () => ({
              slots: newSlots,
              globalTempoBpm: newTempo,
            }));
          }),

        addSamplesToStack: (samples, maxCount = 8) =>
          set((state) => {
            const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
            if (!active) return {};
            const toAdd = samples.slice(0, maxCount).map((s) => ({
              id: crypto.randomUUID(),
              ...s,
              bpm: getBpmFromSample(s.name, s.path),
            }));
            const newSlots = [...active.slots];
            let slotIdx = active.activeSlotIndex;
            for (const s of toAdd) {
              while (slotIdx < newSlots.length && newSlots[slotIdx] != null) slotIdx++;
              if (slotIdx >= newSlots.length) break;
              newSlots[slotIdx] = s;
              slotIdx++;
            }
            const newStack = slotsToStack(newSlots);
            const newTempo =
              active.bpmAuto && newStack.length > 0 && slotsToStack(active.slots).length === 0
                ? toAdd[0].bpm
                : active.globalTempoBpm;
            return updateActiveStack(state, () => ({
              slots: newSlots,
              globalTempoBpm: newTempo,
            }));
          }),

        addSlotRow: () =>
          set((state) =>
            updateActiveStack(state, (stack) => ({
              slots: [...stack.slots, ...Array.from({ length: SLOT_ROW_SIZE }, () => null)],
            })),
          ),

        addSlotRowAt: (rowIndex) =>
          set((state) => {
            const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
            if (!active) return {};
            const rows = chunkSlots(active.slots);
            const clampedRowIndex = Math.max(0, Math.min(rowIndex, rows.length));
            const newRow = Array.from({ length: SLOT_ROW_SIZE }, () => null);
            const newRows = [...rows];
            newRows.splice(clampedRowIndex, 0, newRow);
            const newSlots = newRows.flat();
            const currentActiveRow = Math.floor(active.activeSlotIndex / SLOT_ROW_SIZE);
            const nextActiveSlotIndex =
              currentActiveRow >= clampedRowIndex ? active.activeSlotIndex + SLOT_ROW_SIZE : active.activeSlotIndex;
            return updateActiveStack(state, () => ({
              slots: newSlots,
              activeSlotIndex: Math.min(nextActiveSlotIndex, newSlots.length - 1),
            }));
          }),

        removeSlotRow: (rowIndex) =>
          set((state) => {
            const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
            if (!active) return {};
            const rows = chunkSlots(active.slots);
            if (rows.length <= 1) return {};
            const clampedRowIndex = Math.max(0, Math.min(rowIndex, rows.length - 1));
            const newRows = [...rows];
            newRows.splice(clampedRowIndex, 1);
            const newSlots = newRows.flat();
            const activeRow = Math.floor(active.activeSlotIndex / SLOT_ROW_SIZE);
            let nextActiveRow = activeRow;
            if (activeRow === clampedRowIndex) {
              nextActiveRow = Math.max(0, clampedRowIndex - 1);
            } else if (activeRow > clampedRowIndex) {
              nextActiveRow = activeRow - 1;
            }
            const activeCol = active.activeSlotIndex % SLOT_ROW_SIZE;
            const nextActiveSlotIndex = Math.min(nextActiveRow * SLOT_ROW_SIZE + activeCol, newSlots.length - 1);
            return updateActiveStack(state, () => ({
              slots: newSlots,
              activeSlotIndex: nextActiveSlotIndex,
            }));
          }),

        moveSlotRow: (fromRowIndex, toRowIndex) =>
          set((state) => {
            const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
            if (!active) return {};
            const rows = chunkSlots(active.slots);
            if (rows.length <= 1) return {};
            const from = Math.max(0, Math.min(fromRowIndex, rows.length - 1));
            const to = Math.max(0, Math.min(toRowIndex, rows.length - 1));
            if (from === to) return {};
            const newRows = [...rows];
            const [movedRow] = newRows.splice(from, 1);
            if (!movedRow) return {};
            newRows.splice(to, 0, movedRow);
            const newSlots = newRows.flat();
            const activeRow = Math.floor(active.activeSlotIndex / SLOT_ROW_SIZE);
            const activeCol = active.activeSlotIndex % SLOT_ROW_SIZE;
            let nextActiveRow = activeRow;
            if (activeRow === from) {
              nextActiveRow = to;
            } else if (from < activeRow && activeRow <= to) {
              nextActiveRow = activeRow - 1;
            } else if (to <= activeRow && activeRow < from) {
              nextActiveRow = activeRow + 1;
            }
            const nextActiveSlotIndex = Math.min(nextActiveRow * SLOT_ROW_SIZE + activeCol, newSlots.length - 1);
            return updateActiveStack(state, () => ({
              slots: newSlots,
              activeSlotIndex: nextActiveSlotIndex,
            }));
          }),

        replaceSampleAt: (index, sample) =>
          set((state) => {
            const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
            if (!active || index < 0 || index >= active.slots.length) return {};
            const bpm = getBpmFromSample(sample.name, sample.path);
            const newSample: StackSample = { id: crypto.randomUUID(), ...sample, bpm };
            const newSlots = [...active.slots];
            newSlots[index] = newSample;
            return updateActiveStack(state, () => ({ slots: newSlots }));
          }),

        removeFromStack: (index) =>
          set((state) => {
            const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
            if (!active || index < 0 || index >= active.slots.length) return {};
            const newSlots = [...active.slots];
            newSlots[index] = null;
            return updateActiveStack(state, () => ({ slots: newSlots }));
          }),

        clearSlot: (index) =>
          set((state) => {
            const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
            if (!active || index < 0 || index >= active.slots.length) return {};
            const newSlots = [...active.slots];
            newSlots[index] = null;
            return updateActiveStack(state, () => ({ slots: newSlots }));
          }),

        updateSampleBars: (index, bars, duration, bpm) => {
          setSkipHistoryForUpdateSampleBars(true);
          try {
            set((state) => {
              const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
              if (!active || index < 0 || index >= active.slots.length) return {};
              const slot = active.slots[index];
              if (!slot) return {};
              const newSlots = [...active.slots];
              newSlots[index] = {
                ...slot,
                bars,
                duration,
                ...(bpm != null && { bpm }),
              };
              return updateActiveStack(state, () => ({ slots: newSlots }));
            });
          } finally {
            setSkipHistoryForUpdateSampleBars(false);
          }
        },

        setGlobalTempoBpm: (bpm) =>
          set((s) => updateActiveStack(s, () => ({ globalTempoBpm: bpm }))),

        setSampleVolume: (index, volume) =>
          set((state) => {
            const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
            if (!active || index < 0 || index >= active.slots.length) return {};
            const slot = active.slots[index];
            if (!slot) return {};
            const newSlots = [...active.slots];
            newSlots[index] = {
              ...slot,
              volume: Math.max(0, Math.min(1, volume)),
            };
            return updateActiveStack(state, () => ({ slots: newSlots }));
          }),

        setSampleMuted: (index, muted) =>
          set((state) => {
            const active = state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0];
            if (!active || index < 0 || index >= active.slots.length) return {};
            const slot = active.slots[index];
            if (!slot) return {};
            const newSlots = [...active.slots];
            newSlots[index] = { ...slot, muted };
            return updateActiveStack(state, () => ({ slots: newSlots }));
          }),

        getActiveStack: (): ProjectStackState | null => {
          const state = get();
          return state.stacks.find((s) => s.id === state.activeStackId) ?? state.stacks[0] ?? null;
        },

        getActiveStackStack: (): StackSample[] => {
          const active = get().getActiveStack();
          return active ? active.slots.filter((s): s is StackSample => s != null) : EMPTY_STACK;
        },

        resetActiveStackSlots: () =>
          set((state) =>
            updateActiveStack(state, () => ({
              slots: Array.from({ length: SLOT_ROW_SIZE }, () => null),
              activeSlotIndex: 0,
            })),
          ),

        hydrateFromProject: (data) => {
          const rawStacks = data.stacks.length > 0 ? data.stacks : [createDefaultStack()];
          const stacks: ProjectStackState[] = rawStacks.map((s) => ({
            ...s,
            previewMode: s.previewMode === "multi" ? "multi" : "single",
          }));
          const activeStackId = data.activeStackId ?? stacks[0]?.id ?? null;
          set({ stacks, activeStackId });
        },

        clear: () => {
          const defaultStack = createDefaultStack();
          set({
            ...metadataInitial,
            stacks: [defaultStack],
            activeStackId: defaultStack.id,
            playingSamplePosition: null,
            playingSamplePositions: {},
          });
        },
      }),
      {
        name: "project-store",
        storage: createJSONStorage(() => localStorage),
        partialize: partializeProjectState,
        onRehydrateStorage: () => {
          setSkipHistoryForHydrate(true);
          return () => {
            setSkipHistoryForHydrate(false);
          };
        },
      },
    ),
    {
      partialize: partializeProjectState,
      limit: 50,
      diff: (past, current) => {
        if (skipHistoryForHydrate || skipHistoryForUpdateSampleBars || skipHistoryForUndoRedo) return null;
        // Don't add duplicate states - prevents "nothing happens" on first undo
        if (JSON.stringify(past) === JSON.stringify(current)) return null;
        // Store past state so undo restores to it (zundo applies last pastState on undo)
        return { ...past };
      },
    },
  ),
);

/** Selector for active stack slots */
export function useActiveStackSlots() {
  return useProjectStore(
    useShallow((s) => {
      const active = s.stacks.find((st) => st.id === s.activeStackId) ?? s.stacks[0];
      return active?.slots ?? EMPTY_SLOTS;
    }),
  );
}

/** Selector for active stack (full) */
export function useActiveStack() {
  return useProjectStore((s) => {
    return s.stacks.find((st) => st.id === s.activeStackId) ?? s.stacks[0] ?? null;
  });
}
