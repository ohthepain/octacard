import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { parseBpmFromString } from "@/lib/tempoUtils";

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
  volume?: number; // Per-sample volume (0-1), defaults to 1
  muted?: boolean; // Mute is separate from volume; unmute restores remembered volume
}

/** Position of a playing sample for wave view sync */
export interface PlayingSamplePosition {
  sampleId: string;
  currentTime: number;
}

/** Per-sample playhead positions when multi is playing (sampleId -> currentTime in seconds) */
export type PlayingSamplePositions = Record<string, number>;

/** Slot row width; rows can be appended dynamically */
export const SLOT_ROW_SIZE = 4;
const MULTI_SAMPLE_STORE_STORAGE_KEY = "octacard_multi_sample_store_v1";

export interface MultiSampleState {
  previewMode: PreviewMode;
  /** Slot-based grid; each entry is null or StackSample */
  slots: (StackSample | null)[];
  /** Which slot is active; shown in wavesurfer when it has a sample */
  activeSlotIndex: number;
  stack: StackSample[]; // derived: slots.filter(Boolean) for backwards compat
  globalTempoBpm: number;
  bpmAuto: boolean;
  /** When a sample is playing, its position for wave view sync (active sample for waveform) */
  playingSamplePosition: PlayingSamplePosition | null;
  /** Per-sample playhead positions when multi is playing (for showing playhead in all blocks) */
  playingSamplePositions: PlayingSamplePositions;
  setPreviewMode: (mode: PreviewMode) => void;
  setBpmAuto: (enabled: boolean) => void;
  setPlayingSamplePosition: (pos: PlayingSamplePosition | null) => void;
  setPlayingSamplePositions: (positions: PlayingSamplePositions) => void;
  setActiveSlotIndex: (index: number) => void;
  /** Put sample in the active slot (replace or fill) */
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
}

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

export const useMultiSampleStore = create<MultiSampleState>()(persist((set) => ({
  previewMode: "single",
  slots: Array.from({ length: SLOT_ROW_SIZE }, () => null),
  activeSlotIndex: 0,
  stack: [], // derived below
  globalTempoBpm: DEFAULT_BPM,
  bpmAuto: true,
  playingSamplePosition: null,
  playingSamplePositions: {},

  setPreviewMode: (mode) => set({ previewMode: mode }),

  setBpmAuto: (enabled) => set({ bpmAuto: enabled }),

  setPlayingSamplePosition: (pos) => set({ playingSamplePosition: pos }),
  setPlayingSamplePositions: (positions) => set({ playingSamplePositions: positions }),

  setActiveSlotIndex: (index) =>
    set((state) => ({
      activeSlotIndex: Math.max(0, Math.min(index, state.slots.length - 1)),
    })),

  putSampleInActiveSlot: (sample) =>
    set((state) => {
      const bpm = getBpmFromSample(sample.name, sample.path);
      const newSample: StackSample = {
        id: crypto.randomUUID(),
        ...sample,
        bpm,
      };
      const idx = state.activeSlotIndex;
      const newSlots = [...state.slots];
      newSlots[idx] = newSample;
      const newStack = slotsToStack(newSlots);
      const newTempo =
        state.bpmAuto && newStack.length === 1
          ? bpm
          : state.globalTempoBpm;
      return {
        slots: newSlots,
        stack: newStack,
        globalTempoBpm: newTempo,
      };
    }),

  addToStack: (sample) =>
    set((state) => {
      const bpm = getBpmFromSample(sample.name, sample.path);
      const newSample: StackSample = {
        id: crypto.randomUUID(),
        ...sample,
        bpm,
      };
      const newSlots = [...state.slots];
      newSlots[state.activeSlotIndex] = newSample;
      const newStack = slotsToStack(newSlots);
      const newTempo =
        state.bpmAuto && newStack.length === 1
          ? bpm
          : state.globalTempoBpm;
      return {
        slots: newSlots,
        stack: newStack,
        globalTempoBpm: newTempo,
      };
    }),

  addSamplesToStack: (samples, maxCount = 8) =>
    set((state) => {
      const toAdd = samples.slice(0, maxCount).map((s) => ({
        id: crypto.randomUUID(),
        ...s,
        bpm: getBpmFromSample(s.name, s.path),
      }));
      const newSlots = [...state.slots];
      let slotIdx = state.activeSlotIndex;
      for (const s of toAdd) {
        while (slotIdx < newSlots.length && newSlots[slotIdx] != null) slotIdx++;
        if (slotIdx >= newSlots.length) break;
        newSlots[slotIdx] = s;
        slotIdx++;
      }
      const newStack = slotsToStack(newSlots);
      const newTempo =
        state.bpmAuto && newStack.length > 0 && state.stack.length === 0
          ? toAdd[0].bpm
          : state.globalTempoBpm;
      return {
        slots: newSlots,
        stack: newStack,
        globalTempoBpm: newTempo,
      };
    }),

  addSlotRow: () =>
    set((state) => {
      const newSlots = [...state.slots, ...Array.from({ length: SLOT_ROW_SIZE }, () => null)];
      return {
        slots: newSlots,
        stack: slotsToStack(newSlots),
      };
    }),

  addSlotRowAt: (rowIndex) =>
    set((state) => {
      const rows = chunkSlots(state.slots);
      const clampedRowIndex = Math.max(0, Math.min(rowIndex, rows.length));
      const newRow = Array.from({ length: SLOT_ROW_SIZE }, () => null);
      const newRows = [...rows];
      newRows.splice(clampedRowIndex, 0, newRow);
      const newSlots = newRows.flat();
      const currentActiveRow = Math.floor(state.activeSlotIndex / SLOT_ROW_SIZE);
      const nextActiveSlotIndex =
        currentActiveRow >= clampedRowIndex ? state.activeSlotIndex + SLOT_ROW_SIZE : state.activeSlotIndex;
      return {
        slots: newSlots,
        stack: slotsToStack(newSlots),
        activeSlotIndex: Math.min(nextActiveSlotIndex, newSlots.length - 1),
      };
    }),

  removeSlotRow: (rowIndex) =>
    set((state) => {
      const rows = chunkSlots(state.slots);
      if (rows.length <= 1) return state;
      const clampedRowIndex = Math.max(0, Math.min(rowIndex, rows.length - 1));
      const newRows = [...rows];
      newRows.splice(clampedRowIndex, 1);
      const newSlots = newRows.flat();
      const activeRow = Math.floor(state.activeSlotIndex / SLOT_ROW_SIZE);
      let nextActiveRow = activeRow;
      if (activeRow === clampedRowIndex) {
        nextActiveRow = Math.max(0, clampedRowIndex - 1);
      } else if (activeRow > clampedRowIndex) {
        nextActiveRow = activeRow - 1;
      }
      const activeCol = state.activeSlotIndex % SLOT_ROW_SIZE;
      const nextActiveSlotIndex = Math.min(nextActiveRow * SLOT_ROW_SIZE + activeCol, newSlots.length - 1);
      return {
        slots: newSlots,
        stack: slotsToStack(newSlots),
        activeSlotIndex: nextActiveSlotIndex,
      };
    }),

  moveSlotRow: (fromRowIndex, toRowIndex) =>
    set((state) => {
      const rows = chunkSlots(state.slots);
      if (rows.length <= 1) return state;
      const from = Math.max(0, Math.min(fromRowIndex, rows.length - 1));
      const to = Math.max(0, Math.min(toRowIndex, rows.length - 1));
      if (from === to) return state;

      const newRows = [...rows];
      const [movedRow] = newRows.splice(from, 1);
      if (!movedRow) return state;
      newRows.splice(to, 0, movedRow);
      const newSlots = newRows.flat();

      const activeRow = Math.floor(state.activeSlotIndex / SLOT_ROW_SIZE);
      const activeCol = state.activeSlotIndex % SLOT_ROW_SIZE;
      let nextActiveRow = activeRow;
      if (activeRow === from) {
        nextActiveRow = to;
      } else if (from < activeRow && activeRow <= to) {
        nextActiveRow = activeRow - 1;
      } else if (to <= activeRow && activeRow < from) {
        nextActiveRow = activeRow + 1;
      }
      const nextActiveSlotIndex = Math.min(nextActiveRow * SLOT_ROW_SIZE + activeCol, newSlots.length - 1);

      return {
        slots: newSlots,
        stack: slotsToStack(newSlots),
        activeSlotIndex: nextActiveSlotIndex,
      };
    }),

  replaceSampleAt: (index, sample) =>
    set((state) => {
      if (index < 0 || index >= state.slots.length) return state;
      const bpm = getBpmFromSample(sample.name, sample.path);
      const newSample: StackSample = {
        id: crypto.randomUUID(),
        ...sample,
        bpm,
      };
      const newSlots = [...state.slots];
      newSlots[index] = newSample;
      return {
        slots: newSlots,
        stack: slotsToStack(newSlots),
      };
    }),

  removeFromStack: (index) =>
    set((state) => {
      if (index < 0 || index >= state.slots.length) return state;
      const newSlots = [...state.slots];
      newSlots[index] = null;
      return {
        slots: newSlots,
        stack: slotsToStack(newSlots),
      };
    }),

  clearSlot: (index) =>
    set((state) => {
      if (index < 0 || index >= state.slots.length) return state;
      const newSlots = [...state.slots];
      newSlots[index] = null;
      return {
        slots: newSlots,
        stack: slotsToStack(newSlots),
      };
    }),

  updateSampleBars: (index, bars, duration, bpm) =>
    set((state) => {
      if (index < 0 || index >= state.slots.length) return state;
      const slot = state.slots[index];
      if (!slot) return state;
      const newSlots = [...state.slots];
      newSlots[index] = {
        ...slot,
        bars,
        duration,
        ...(bpm != null && { bpm }),
      };
      return {
        slots: newSlots,
        stack: slotsToStack(newSlots),
      };
    }),

  setGlobalTempoBpm: (bpm) => set({ globalTempoBpm: bpm }),

  setSampleVolume: (index, volume) =>
    set((state) => {
      if (index < 0 || index >= state.slots.length) return state;
      const slot = state.slots[index];
      if (!slot) return state;
      const newSlots = [...state.slots];
      newSlots[index] = {
        ...slot,
        volume: Math.max(0, Math.min(1, volume)),
      };
      return {
        slots: newSlots,
        stack: slotsToStack(newSlots),
      };
    }),

  setSampleMuted: (index, muted) =>
    set((state) => {
      if (index < 0 || index >= state.slots.length) return state;
      const slot = state.slots[index];
      if (!slot) return state;
      const newSlots = [...state.slots];
      newSlots[index] = {
        ...slot,
        muted,
      };
      return {
        slots: newSlots,
        stack: slotsToStack(newSlots),
      };
    }),
}), {
  name: MULTI_SAMPLE_STORE_STORAGE_KEY,
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    previewMode: state.previewMode,
    slots: state.slots,
    activeSlotIndex: state.activeSlotIndex,
    globalTempoBpm: state.globalTempoBpm,
    bpmAuto: state.bpmAuto,
  }),
  merge: (persistedState, currentState) => {
    const persisted = persistedState as Partial<MultiSampleState>;
    const slots =
      Array.isArray(persisted.slots) && persisted.slots.length > 0
        ? persisted.slots
        : currentState.slots;
    return {
      ...currentState,
      ...persisted,
      slots,
      activeSlotIndex: Math.max(0, Math.min(persisted.activeSlotIndex ?? currentState.activeSlotIndex, slots.length - 1)),
      stack: slotsToStack(slots),
    };
  },
}));
