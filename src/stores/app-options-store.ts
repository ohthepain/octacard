import { create } from "zustand";

export interface AppOptionsState {
  devMode: boolean;
  setDevMode: (devMode: boolean) => void;
  toggleDevMode: () => void;
  cacheDebugPanelOpen: boolean;
  openCacheDebug: () => void;
  closeCacheDebug: () => void;
  toggleCacheDebug: () => void;
}

export const useAppOptionsStore = create<AppOptionsState>((set) => ({
  devMode: false,
  setDevMode: (devMode) => set({ devMode }),
  toggleDevMode: () => set((state) => ({ devMode: !state.devMode })),
  cacheDebugPanelOpen: false,
  openCacheDebug: () => set({ cacheDebugPanelOpen: true }),
  closeCacheDebug: () => set({ cacheDebugPanelOpen: false }),
  toggleCacheDebug: () => set((s) => ({ cacheDebugPanelOpen: !s.cacheDebugPanelOpen })),
}));
