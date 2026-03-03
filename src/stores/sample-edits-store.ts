import { create } from "zustand";

export interface EnvelopePoint {
  time: number;
  volume: number;
}

export interface RegionParams {
  start: number;
  end: number;
}

export interface SampleEdits {
  region?: RegionParams | null;
  envelopePoints?: EnvelopePoint[];
  /** Playback loop region (start/end in seconds). Defaults to region or full duration. */
  loopStart?: number;
  loopEnd?: number;
  /** Where play starts within the loop region (seconds). */
  playStart?: number;
  /** Whether playback loops within the region. */
  loopEnabled?: boolean;
}

interface SampleEditsState {
  /** Edits keyed by file path (virtual path) */
  editsByPath: Map<string, SampleEdits>;
  setEdits: (path: string, edits: SampleEdits) => void;
  getEdits: (path: string) => SampleEdits | undefined;
  clearEdits: (path: string) => void;
}

export const useSampleEditsStore = create<SampleEditsState>((set, get) => ({
  editsByPath: new Map(),

  setEdits: (path, edits) =>
    set((state) => {
      const next = new Map(state.editsByPath);
      next.set(path, edits);
      return { editsByPath: next };
    }),

  getEdits: (path) => get().editsByPath.get(path),

  clearEdits: (path) =>
    set((state) => {
      const next = new Map(state.editsByPath);
      next.delete(path);
      return { editsByPath: next };
    }),
}));
