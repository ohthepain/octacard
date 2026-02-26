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

export interface MultiSampleState {
  previewMode: PreviewMode;
  stack: StackSample[];
  globalTempoBpm: number;
  setPreviewMode: (mode: PreviewMode) => void;
  addToStack: (sample: { path: string; name: string; paneType: PaneType }) => void;
  addSamplesToStack: (samples: Array<{ path: string; name: string; paneType: PaneType }>, maxCount?: number) => void;
  replaceSampleAt: (index: number, sample: { path: string; name: string; paneType: PaneType }) => void;
  removeFromStack: (index: number) => void;
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

export const useMultiSampleStore = create<MultiSampleState>((set) => ({
  previewMode: "single",
  stack: [],
  globalTempoBpm: DEFAULT_BPM,

  setPreviewMode: (mode) => set({ previewMode: mode }),

  addToStack: (sample) =>
    set((state) => {
      const bpm = getBpmFromSample(sample.name, sample.path);
      const newSample: StackSample = {
        id: crypto.randomUUID(),
        ...sample,
        bpm,
      };
      const newStack = [newSample, ...state.stack];
      const newTempo =
        state.stack.length === 0 ? bpm : state.globalTempoBpm;
      return {
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
      const newStack = [...toAdd, ...state.stack];
      const newTempo =
        state.stack.length === 0 && toAdd.length > 0
          ? toAdd[0].bpm
          : state.globalTempoBpm;
      return {
        stack: newStack,
        globalTempoBpm: newTempo,
      };
    }),

  replaceSampleAt: (index, sample) =>
    set((state) => {
      if (index < 0 || index >= state.stack.length) return state;
      const bpm = getBpmFromSample(sample.name, sample.path);
      const newSample: StackSample = {
        id: crypto.randomUUID(),
        ...sample,
        bpm,
      };
      const newStack = state.stack.map((s, i) =>
        i === index ? newSample : s
      );
      return { stack: newStack };
    }),

  removeFromStack: (index) =>
    set((state) => ({
      stack: state.stack.filter((_, i) => i !== index),
    })),

  updateSampleBars: (index, bars, duration, bpm) =>
    set((state) => {
      const newStack = state.stack.map((s, i) =>
        i === index
          ? { ...s, bars, duration, ...(bpm != null && { bpm }) }
          : s
      );
      return { stack: newStack };
    }),

  setGlobalTempoBpm: (bpm) => set({ globalTempoBpm: bpm }),
}));
