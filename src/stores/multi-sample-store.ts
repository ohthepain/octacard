import { create } from "zustand";
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
  replaceSampleAt: (index: number, sample: { path: string; name: string; paneType: PaneType }) => void;
  removeFromStack: (index: number) => void;
  clearSlot: (index: number) => void;
  updateSampleBars: (index: number, bars: number, duration: number, bpm?: number) => void;
  setGlobalTempoBpm: (bpm: number) => void;
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

export const useMultiSampleStore = create<MultiSampleState>((set) => ({
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
    set((state) => ({
      slots: [...state.slots, ...Array.from({ length: SLOT_ROW_SIZE }, () => null)],
    })),

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
}));
