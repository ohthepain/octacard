import { create } from "zustand";
import type { PaneType } from "./multi-sample-store";

export interface PlayingSample {
  id: string;
  path: string;
  name: string;
  paneType: PaneType;
  bpm?: number;
  duration?: number;
}

export type PlayerMode = "single" | "multi";

export interface RestartRequest {
  path: string;
  newLoopStart: number;
  newLoopEnd: number;
}

export interface SwitchAtBarRequest {
  path: string;
  paneType: PaneType;
}

export interface PlayerState {
  isPlaying: boolean;
  mode: PlayerMode;
  /** Single mode: the one file being played */
  singleFile: { path: string; paneType: PaneType } | null;
  /** Multi mode: samples in the stack */
  stack: PlayingSample[];
  /** Which sample is active (for waveform editor display). Sample id in multi, or path in single. */
  activeSampleId: string | null;
  /** Current playhead position in seconds (for active sample) */
  currentTime: number;
  volume: number;
  playbackRate: number;
  globalTempoBpm: number;
  /** When set, playback should restart with new loop params (Ableton-style loop sync) */
  restartRequest: RestartRequest | null;
  /** When set, switch to this sample at the next bar boundary (single mode, sample-accurate) */
  switchAtBarRequest: SwitchAtBarRequest | null;
}

export interface PlayerActions {
  playSingle: (path: string, paneType: PaneType) => void;
  playMulti: (samples: PlayingSample[]) => void;
  stop: () => void;
  setActiveSample: (id: string | null) => void;
  setCurrentTime: (t: number) => void;
  setVolume: (v: number) => void;
  setPlaybackRate: (r: number) => void;
  setGlobalTempoBpm: (bpm: number) => void;
  requestRestartWithNewLoop: (req: RestartRequest) => void;
  clearRestartRequest: () => void;
  requestSwitchAtNextBar: (path: string, paneType: PaneType) => void;
  clearSwitchAtBarRequest: () => void;
}

/** Internal: called by playback engine when playback ends */
export type PlayerOnEnded = () => void;

/** Internal: called by playback engine for playhead updates */
export type PlayerOnTimeUpdate = (sampleId: string, currentTime: number) => void;

export const usePlayerStore = create<PlayerState & PlayerActions>((set, get) => ({
  isPlaying: false,
  mode: "single",
  singleFile: null,
  stack: [],
  activeSampleId: null,
  currentTime: 0,
  volume: 1,
  playbackRate: 1,
  globalTempoBpm: 120,
  restartRequest: null,
  switchAtBarRequest: null,

  playSingle: (path, paneType) =>
    set({
      isPlaying: true,
      mode: "single",
      singleFile: { path, paneType },
      stack: [],
      activeSampleId: path,
    }),

  playMulti: (samples) =>
    set({
      isPlaying: true,
      mode: "multi",
      singleFile: null,
      stack: samples,
      activeSampleId: samples[0]?.id ?? null,
    }),

  stop: () =>
    set({
      isPlaying: false,
      currentTime: 0,
    }),

  setActiveSample: (id) => set({ activeSampleId: id }),

  setCurrentTime: (t) => set({ currentTime: t }),

  setVolume: (v) => set({ volume: v }),

  setPlaybackRate: (r) => set({ playbackRate: r }),

  setGlobalTempoBpm: (bpm) => set({ globalTempoBpm: bpm }),

  requestRestartWithNewLoop: (req) => set({ restartRequest: req }),
  clearRestartRequest: () => set({ restartRequest: null }),
  requestSwitchAtNextBar: (path, paneType) => set({ switchAtBarRequest: { path, paneType } }),
  clearSwitchAtBarRequest: () => set({ switchAtBarRequest: null }),
}));
