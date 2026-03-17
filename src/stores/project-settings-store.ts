/**
 * Store for opening project settings dialog from outside (e.g. Live button).
 */
import { create } from "zustand";

interface ProjectSettingsState {
  /** Incremented when project settings should open. Subscribe to open dialog. */
  openRequestVersion: number;
  /** Request opening the project settings dialog. */
  requestOpen: () => void;
}

export const useProjectSettingsStore = create<ProjectSettingsState>((set) => ({
  openRequestVersion: 0,

  requestOpen: () => set((s) => ({ openRequestVersion: s.openRequestVersion + 1 })),
}));
