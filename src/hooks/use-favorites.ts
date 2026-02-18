import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "octacard_favorites";
const FAVORITES_CHANGED_EVENT = "octacard:favorites-changed";

export interface Favorite {
  path: string;
  name: string;
}

/** Get storage key for favorites: per pane type (source/dest) and per volume */
function getStorageKey(paneType: "source" | "dest", volumeId: string): string {
  const vol = volumeId || "_default";
  return `${STORAGE_KEY}_${paneType}_${vol}`;
}

function readFavorites(key: string): Favorite[] {
  try {
    const saved = localStorage.getItem(key);
    if (!saved) return [];
    return JSON.parse(saved) as Favorite[];
  } catch {
    return [];
  }
}

function emitFavoritesChanged(key: string) {
  window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT, { detail: { key } }));
}

/**
 * Hook for managing favorites per pane type (source/dest) and per volume
 */
export function useFavorites(paneType: "source" | "dest", volumeId: string) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  // Load favorites and keep multiple hook instances in sync.
  useEffect(() => {
    const key = getStorageKey(paneType, volumeId);
    const sync = () => setFavorites(readFavorites(key));
    const onChanged = (event: Event) => {
      const changedKey = (event as CustomEvent<{ key?: string }>).detail?.key;
      if (changedKey === key) {
        sync();
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === key) {
        sync();
      }
    };

    sync();
    window.addEventListener(FAVORITES_CHANGED_EVENT, onChanged as EventListener);
    window.addEventListener("storage", onStorage);

    return () => {
      window.removeEventListener(FAVORITES_CHANGED_EVENT, onChanged as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, [paneType, volumeId]);

  const persistFavorites = useCallback(
    (nextFavorites: Favorite[]) => {
      try {
        const key = getStorageKey(paneType, volumeId);
        localStorage.setItem(key, JSON.stringify(nextFavorites));
        emitFavoritesChanged(key);
      } catch (error) {
        console.error("Failed to save favorites:", error);
      }
    },
    [paneType, volumeId]
  );

  const addFavorite = useCallback(
    (path: string, name: string) => {
      const newFavorite: Favorite = { path, name };
      setFavorites((prev) => {
        const updated = [...prev, newFavorite];
        const unique = Array.from(
          new Map(updated.map((fav) => [fav.path, fav])).values()
        );
        persistFavorites(unique);
        return unique;
      });
    },
    [persistFavorites]
  );

  const removeFavorite = useCallback(
    (path: string) => {
      setFavorites((prev) => {
        const updated = prev.filter((fav) => fav.path !== path);
        persistFavorites(updated);
        return updated;
      });
    },
    [persistFavorites]
  );

  const isFavorite = useCallback(
    (path: string) => {
      return favorites.some((fav) => fav.path === path);
    },
    [favorites]
  );

  return {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
  };
}
