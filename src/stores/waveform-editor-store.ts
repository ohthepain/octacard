import { create } from "zustand";
import { usePlayerStore } from "./player-store";

interface WaveformEditorState {
  isOpen: boolean;
  /**
   * Header toggle / ⌘E: enables empty editor and closes the panel when turned off.
   * Opening a specific file always uses {@link openWithFile} / {@link openWithFileFromMulti} regardless of this flag.
   */
  enabled: boolean;
  /** True when opened from header button (empty state) */
  isEmptyState: boolean;
  open: () => void;
  openWithFile: (filePath: string, fileName: string, paneType: "source" | "dest") => void;
  /** Open with file from multi-sample block; enables playback sync with multi stack */
  openWithFileFromMulti: (filePath: string, fileName: string, paneType: "source" | "dest", sampleId: string) => void;
  close: () => void;
  setEnabled: (enabled: boolean) => void;
  /** Current file when not empty */
  filePath: string | null;
  fileName: string | null;
  paneType: "source" | "dest" | null;
  /** When set, wave view is showing a multi sample and should sync playhead with its playback */
  multiSampleId: string | null;
}

export const useWaveformEditorStore = create<WaveformEditorState>((set, get) => ({
  isOpen: false,
  enabled: false,
  isEmptyState: false,
  filePath: null,
  fileName: null,
  paneType: null,
  multiSampleId: null,

  open: () => {
    if (!get().enabled) return;
    set({
      isOpen: true,
      isEmptyState: true,
      filePath: null,
      fileName: null,
      paneType: null,
      multiSampleId: null,
    });
  },

  openWithFile: (filePath, fileName, paneType) => {
    const player = usePlayerStore.getState();
    if (player.mode === "single" && player.isPlaying) {
      player.stop();
      usePlayerStore.getState().playSingle(filePath, paneType);
    }
    return set({
      isOpen: true,
      isEmptyState: false,
      filePath,
      fileName,
      paneType,
      multiSampleId: null,
    });
  },

  openWithFileFromMulti: (filePath, fileName, paneType, sampleId) => {
    set({
      isOpen: true,
      isEmptyState: false,
      filePath,
      fileName,
      paneType,
      multiSampleId: sampleId,
    });
  },

  setEnabled: (enabled) =>
    set((s) => {
      if (!enabled && s.isOpen) {
        return {
          enabled,
          isOpen: false,
          isEmptyState: false,
          filePath: null,
          fileName: null,
          paneType: null,
          multiSampleId: null,
        };
      }
      return { enabled };
    }),

  close: () =>
    set({
      isOpen: false,
      isEmptyState: false,
      filePath: null,
      fileName: null,
      paneType: null,
      multiSampleId: null,
    }),
}));
