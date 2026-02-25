import { useSyncExternalStore } from "react";

export interface AppOptionsState {
  devMode: boolean;
  setDevMode: (devMode: boolean) => void;
  toggleDevMode: () => void;
}

type Listener = () => void;

const DEFAULT_STATE: AppOptionsState = {
  devMode: false,
  setDevMode: () => {},
  toggleDevMode: () => {},
};

let state: AppOptionsState = {
  ...DEFAULT_STATE,
  setDevMode: (devMode: boolean) => {
    if (state.devMode === devMode) return;
    setState({ ...state, devMode });
  },
  toggleDevMode: () => {
    setState({ ...state, devMode: !state.devMode });
  },
};
const listeners = new Set<Listener>();

function emitChange() {
  listeners.forEach((listener) => listener());
}

function setState(nextState: AppOptionsState) {
  state = nextState;
  emitChange();
}

export const appOptionsStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getState() {
    return state;
  },
  setDevMode(devMode: boolean) {
    state.setDevMode(devMode);
  },
  toggleDevMode() {
    state.toggleDevMode();
  },
};

export function useAppOptionsStore<T>(selector: (currentState: AppOptionsState) => T): T {
  return useSyncExternalStore(
    appOptionsStore.subscribe,
    () => selector(appOptionsStore.getState()),
    () => selector(DEFAULT_STATE),
  );
}
