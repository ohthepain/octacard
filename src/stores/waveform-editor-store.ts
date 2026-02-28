import { create } from "zustand";

interface WaveformEditorState {
  isOpen: boolean;
  /** True when opened from header button (empty state) */
  isEmptyState: boolean;
  open: () => void;
  openWithFile: (filePath: string, fileName: string, paneType: "source" | "dest") => void;
  close: () => void;
  /** Current file when not empty */
  filePath: string | null;
  fileName: string | null;
  paneType: "source" | "dest" | null;
}

export const useWaveformEditorStore = create<WaveformEditorState>((set) => ({
  isOpen: false,
  isEmptyState: false,
  filePath: null,
  fileName: null,
  paneType: null,

  open: () =>
    set({
      isOpen: true,
      isEmptyState: true,
      filePath: null,
      fileName: null,
      paneType: null,
    }),

  openWithFile: (filePath, fileName, paneType) =>
    set({
      isOpen: true,
      isEmptyState: false,
      filePath,
      fileName,
      paneType,
    }),

  close: () =>
    set({
      isOpen: false,
      isEmptyState: false,
      filePath: null,
      fileName: null,
      paneType: null,
    }),
}));
