import { useCallback, useRef, useSyncExternalStore } from "react";

export type FavoritePaneType = "source" | "dest";

/** Local folder permission (handle in IndexedDB) or virtual path under current library/dest root. */
export interface Favorite {
  id: string;
  name: string;
  /** Present for path-based favourites (FilePane / legacy project list). */
  path?: string;
  /** When true, `FileSystemDirectoryHandle` is stored in IndexedDB under `id` (source pane only). */
  permission?: boolean;
}

interface FavoritesState {
  favoritesByVolume: Record<string, Favorite[]>;
}

const LEGACY_STORAGE_PREFIX = "octacard_favorites";
const STORE_STORAGE_KEY = "octacard_favorites_store_v2";
const EMPTY_STATE: FavoritesState = { favoritesByVolume: {} };
const EMPTY_FAVORITES: Favorite[] = [];

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function newFavoriteId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `fav_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

/** Stable bucket id for favorites (must match getLegacyStorageKey / persisted `source__default` keys). */
export function getFavoritesVolumeKey(paneType: FavoritePaneType, volumeId: string): string {
  // Align with getLegacyStorageKey: web fallback volume id is "default", not "_default".
  // Using "_default" here produced `source___default`, which never matched `source__default` buckets.
  const vol = !volumeId || volumeId === "_default" ? "default" : volumeId;
  return `${paneType}__${vol}`;
}

function getLegacyStorageKey(volumeKey: string): string {
  const [paneType, volumeId] = volumeKey.split("__");
  const vol = volumeId || "default";
  return `${LEGACY_STORAGE_PREFIX}_${paneType}_${vol}`;
}

function dedupeFavorites(favorites: Favorite[]): Favorite[] {
  const byId = new Map<string, Favorite>();
  for (const f of favorites) {
    byId.set(f.id, f);
  }
  return Array.from(byId.values());
}

function parseLegacyFavoriteItem(item: unknown): Favorite | null {
  if (!item || typeof item !== "object") return null;
  const o = item as Record<string, unknown>;
  if (typeof o.name !== "string") return null;
  const id = typeof o.id === "string" ? o.id : newFavoriteId();
  if (o.permission === true) {
    return { id, name: o.name, permission: true, ...(typeof o.path === "string" ? { path: o.path } : {}) };
  }
  if (typeof o.path === "string") {
    return { id, name: o.name, path: o.path };
  }
  return null;
}

function parseFavorites(value: string | null): Favorite[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parseLegacyFavoriteItem).filter((x): x is Favorite => x !== null);
  } catch {
    return [];
  }
}

function migrateV1ToV2IfNeeded(): void {
  if (!isBrowser()) return;
  const v2 = localStorage.getItem(STORE_STORAGE_KEY);
  if (v2) return;
  const v1Key = "octacard_favorites_store_v1";
  const raw = localStorage.getItem(v1Key);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw) as FavoritesState;
    if (!parsed?.favoritesByVolume || typeof parsed.favoritesByVolume !== "object") return;
    const next: FavoritesState = { favoritesByVolume: {} };
    for (const [key, list] of Object.entries(parsed.favoritesByVolume)) {
      if (!Array.isArray(list)) continue;
      const migrated: Favorite[] = [];
      for (const item of list) {
        if (item && typeof item === "object" && "path" in item && "name" in item) {
          const o = item as { path: string; name: string; id?: string };
          migrated.push({
            id: typeof o.id === "string" ? o.id : newFavoriteId(),
            path: o.path,
            name: o.name,
          });
        }
      }
      next.favoritesByVolume[key] = dedupeFavorites(migrated);
    }
    localStorage.setItem(STORE_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

function readStoreState(): FavoritesState | null {
  if (!isBrowser()) return null;
  migrateV1ToV2IfNeeded();
  const raw = localStorage.getItem(STORE_STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as FavoritesState;
    if (!parsed || typeof parsed !== "object" || typeof parsed.favoritesByVolume !== "object") {
      return null;
    }
    const normalized: Record<string, Favorite[]> = {};
    for (const [key, favorites] of Object.entries(parsed.favoritesByVolume)) {
      const list = Array.isArray(favorites) ? favorites.map(parseLegacyFavoriteItem).filter((x): x is Favorite => !!x) : [];
      normalized[key] = dedupeFavorites(list);
    }
    return { favoritesByVolume: normalized };
  } catch {
    return null;
  }
}

/** Map legacy `octacard_favorites_*` localStorage key suffix to `source__${volumeId}` volume key. */
function legacyStorageKeySuffixToVolumeKey(suffix: string): string | null {
  // Tests (and some older builds) used `octacard_favorites_source__default`; splitting on the first
  // `_` alone yields volumeId `_default` and a bogus `source___default` bucket. Canonical persist keys
  // are `octacard_favorites_source_default` from getLegacyStorageKey("source__default").
  if (suffix === "source__default" || suffix === "dest__default") {
    return suffix === "source__default" ? "source__default" : "dest__default";
  }
  const firstUnderscore = suffix.indexOf("_");
  if (firstUnderscore === -1) return null;
  const paneType = suffix.slice(0, firstUnderscore);
  const volumeId = suffix.slice(firstUnderscore + 1) || "_default";
  if (paneType !== "source" && paneType !== "dest") return null;
  return `${paneType}__${volumeId}`;
}

function readLegacyState(): FavoritesState {
  if (!isBrowser()) return EMPTY_STATE;
  const favoritesByVolume: Record<string, Favorite[]> = {};
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key?.startsWith(`${LEGACY_STORAGE_PREFIX}_`)) continue;
    if (key.startsWith(`${LEGACY_STORAGE_PREFIX}_store_`)) continue;
    const suffix = key.slice(`${LEGACY_STORAGE_PREFIX}_`.length);
    const volumeKey = legacyStorageKeySuffixToVolumeKey(suffix);
    if (!volumeKey) continue;
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

/** Lazily loaded so the first read happens after Playwright init scripts (and other bootstraps) populate localStorage. */
let state: FavoritesState | null = null;
const listeners = new Set<Listener>();
let storageListenerAttached = false;

function readFavoritesState(): FavoritesState {
  if (state === null) {
    state = loadInitialState();
  }
  return state;
}

function emitChange() {
  listeners.forEach((listener) => {
    listener();
  });
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
    if (
      event.key === STORE_STORAGE_KEY ||
      event.key === "octacard_favorites_store_v1" ||
      event.key.startsWith(`${LEGACY_STORAGE_PREFIX}_`)
    ) {
      state = loadInitialState();
      emitChange();
    }
  });
  storageListenerAttached = true;
}

export type AddFavoriteInput =
  | { kind: "virtualPath"; path: string; name: string }
  | { kind: "permission"; id: string; name: string };

export const favoritesStore = {
  subscribe(listener: Listener) {
    listeners.add(listener);
    attachStorageListener();
    return () => {
      listeners.delete(listener);
    };
  },
  getState() {
    return readFavoritesState();
  },
  getFavorites(paneType: FavoritePaneType, volumeId: string): Favorite[] {
    const key = getFavoritesVolumeKey(paneType, volumeId);
    return readFavoritesState().favoritesByVolume[key] ?? EMPTY_FAVORITES;
  },
  addFavorite(paneType: FavoritePaneType, volumeId: string, input: AddFavoriteInput) {
    const key = getFavoritesVolumeKey(paneType, volumeId);
    const current = readFavoritesState().favoritesByVolume[key] ?? [];
    let next: Favorite[];
    if (input.kind === "virtualPath") {
      const withoutPath = current.filter((f) => f.path !== input.path);
      const entry: Favorite = { id: newFavoriteId(), path: input.path, name: input.name };
      next = dedupeFavorites([...withoutPath, entry]);
    } else {
      const entry: Favorite = { id: input.id, name: input.name, permission: true };
      next = dedupeFavorites([...current.filter((f) => f.id !== input.id), entry]);
    }
    const prev = readFavoritesState();
    setState({
      favoritesByVolume: {
        ...prev.favoritesByVolume,
        [key]: next,
      },
    });
  },
  removeFavorite(paneType: FavoritePaneType, volumeId: string, favoriteId: string) {
    const key = getFavoritesVolumeKey(paneType, volumeId);
    const current = readFavoritesState().favoritesByVolume[key] ?? [];
    const next = current.filter((favorite) => favorite.id !== favoriteId);
    const prev = readFavoritesState();
    setState({
      favoritesByVolume: {
        ...prev.favoritesByVolume,
        [key]: next,
      },
    });
  },
  isFavorite(paneType: FavoritePaneType, volumeId: string, path: string): boolean {
    const key = getFavoritesVolumeKey(paneType, volumeId);
    return (readFavoritesState().favoritesByVolume[key] ?? []).some((favorite) => favorite.path === path);
  },
};

export function useFavoritesSelector<T>(selector: (currentState: FavoritesState) => T): T {
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const getSnapshot = useCallback(() => selectorRef.current(favoritesStore.getState()), []);
  return useSyncExternalStore(favoritesStore.subscribe, getSnapshot, getSnapshot);
}
