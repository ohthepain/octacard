import { create } from "zustand";

export interface AppOptionsState {
  devMode: boolean;
  setDevMode: (devMode: boolean) => void;
  toggleDevMode: () => void;
}

export const useAppOptionsStore = create<AppOptionsState>((set) => ({
  devMode: false,
  setDevMode: (devMode) => set({ devMode }),
  toggleDevMode: () => set((state) => ({ devMode: !state.devMode })),
}));
