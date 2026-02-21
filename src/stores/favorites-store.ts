import { useSyncExternalStore } from "react";

export type FavoritePaneType = "source" | "dest";

export interface Favorite {
  path: string;
  name: string;
}

interface FavoritesState {
  favoritesByVolume: Record<string, Favorite[]>;
}

const LEGACY_STORAGE_PREFIX = "octacard_favorites";
const STORE_STORAGE_KEY = "octacard_favorites_store_v1";
const EMPTY_STATE: FavoritesState = { favoritesByVolume: {} };

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function getVolumeKey(paneType: FavoritePaneType, volumeId: string): string {
  const vol = volumeId || "_default";
  return `${paneType}__${vol}`;
}

function getLegacyStorageKey(volumeKey: string): string {
  const [paneType, volumeId] = volumeKey.split("__");
  const vol = volumeId || "_default";
  return `${LEGACY_STORAGE_PREFIX}_${paneType}_${vol}`;
}

function dedupeFavorites(favorites: Favorite[]): Favorite[] {
  return Array.from(new Map(favorites.map((favorite) => [favorite.path, favorite])).values());
}

function parseFavorites(value: string | null): Favorite[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Favorite => {
        return Boolean(item && typeof item.path === "string" && typeof item.name === "string");
      })
      .map((item) => ({ path: item.path, name: item.name }));
  } catch {
    return [];
  }
}

function readStoreState(): FavoritesState | null {
  if (!isBrowser()) return null;
  const raw = localStorage.getItem(STORE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FavoritesState;
    if (!parsed || typeof parsed !== "object" || typeof parsed.favoritesByVolume !== "object") {
      return null;
    }
    const normalized: Record<string, Favorite[]> = {};
    for (const [key, favorites] of Object.entries(parsed.favoritesByVolume)) {
      normalized[key] = dedupeFavorites(Array.isArray(favorites) ? favorites : []);
    }
    return { favoritesByVolume: normalized };
  } catch {
    return null;
  }
}

function readLegacyState(): FavoritesState {
  if (!isBrowser()) return EMPTY_STATE;
  const favoritesByVolume: Record<string, Favorite[]> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(`${LEGACY_STORAGE_PREFIX}_`)) continue;
    const suffix = key.slice(`${LEGACY_STORAGE_PREFIX}_`.length);
    const firstUnderscore = suffix.indexOf("_");
    if (firstUnderscore === -1) continue;
    const paneType = suffix.slice(0, firstUnderscore);
    const volumeId = suffix.slice(firstUnderscore + 1) || "_default";
    if (paneType !== "source" && paneType !== "dest") continue;
    const volumeKey = `${paneType}__${volumeId}`;
    favoritesByVolume[volumeKey] = dedupeFavorites(parseFavorites(localStorage.getItem(key)));
  }
  return { favoritesByVolume };
}

function loadInitialState(): FavoritesState {
  const fromStore = readStoreState();
  if (fromStore) return fromStore;
  return readLegacyState();
}

type Listener = () => void;

let state: FavoritesState = loadInitialState();
const listeners = new Set<Listener>();
let storageListenerAttached = false;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function persistState(nextState: FavoritesState) {
  if (!isBrowser()) return;
  localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(nextState));
  for (const [volumeKey, favorites] of Object.entries(nextState.favoritesByVolume)) {
    localStorage.setItem(getLegacyStorageKey(volumeKey), JSON.stringify(favorites));
  }
}

function setState(nextState: FavoritesState) {
  state = nextState;
  persistState(nextState);
  emitChange();
}

function attachStorageListener() {
  if (!isBrowser() || storageListenerAttached) return;
  window.addEventListener("storage", (event) => {
    if (!event.key) return;
    if (event.key === STORE_STORAGE_KEY || event.key.startsWith(`${LEGACY_STORAGE_PREFIX}_`)) {
      state = loadInitialState();
      emitChange();
    }
  });
  storageListenerAttached = true;
}

export const favoritesStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    attachStorageListener();
    return () => {
      listeners.delete(listener);
    };
  },
  getState() {
    return state;
  },
  getFavorites(paneType: FavoritePaneType, volumeId: string): Favorite[] {
    const key = getVolumeKey(paneType, volumeId);
    return state.favoritesByVolume[key] ?? [];
  },
  addFavorite(paneType: FavoritePaneType, volumeId: string, path: string, name: string) {
    const key = getVolumeKey(paneType, volumeId);
    const current = state.favoritesByVolume[key] ?? [];
    const next = dedupeFavorites([...current, { path, name }]);
    setState({
      favoritesByVolume: {
        ...state.favoritesByVolume,
        [key]: next,
      },
    });
  },
  removeFavorite(paneType: FavoritePaneType, volumeId: string, path: string) {
    const key = getVolumeKey(paneType, volumeId);
    const current = state.favoritesByVolume[key] ?? [];
    const next = current.filter((favorite) => favorite.path !== path);
    setState({
      favoritesByVolume: {
        ...state.favoritesByVolume,
        [key]: next,
      },
    });
  },
  isFavorite(paneType: FavoritePaneType, volumeId: string, path: string): boolean {
    const key = getVolumeKey(paneType, volumeId);
    return (state.favoritesByVolume[key] ?? []).some((favorite) => favorite.path === path);
  },
};

export function useFavoritesSelector<T>(selector: (currentState: FavoritesState) => T): T {
  return useSyncExternalStore(
    favoritesStore.subscribe,
    () => selector(favoritesStore.getState()),
    () => selector(EMPTY_STATE),
  );
}
