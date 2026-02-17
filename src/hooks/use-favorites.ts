import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "octacard_favorites";

export interface Favorite {
  path: string;
  name: string;
}

/** Get storage key for favorites: per pane type (source/dest) and per volume */
function getStorageKey(paneType: "source" | "dest", volumeId: string): string {
  const vol = volumeId || "_default";
  return `${STORAGE_KEY}_${paneType}_${vol}`;
}

/**
 * Hook for managing favorites per pane type (source/dest) and per volume
 */
export function useFavorites(paneType: "source" | "dest", volumeId: string) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  // Load favorites from localStorage on mount or when volume changes
  useEffect(() => {
    try {
      const key = getStorageKey(paneType, volumeId);
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as Favorite[];
        setFavorites(parsed);
      } else {
        setFavorites([]);
      }
    } catch (error) {
      console.error("Failed to load favorites:", error);
    }
  }, [paneType, volumeId]);

  // Save favorites to localStorage whenever they change
  const saveFavorites = useCallback(
    (newFavorites: Favorite[]) => {
      try {
        const key = getStorageKey(paneType, volumeId);
        localStorage.setItem(key, JSON.stringify(newFavorites));
        setFavorites(newFavorites);
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
        const key = getStorageKey(paneType, volumeId);
        localStorage.setItem(key, JSON.stringify(unique));
        return unique;
      });
    },
    [paneType, volumeId]
  );

  const removeFavorite = useCallback(
    (path: string) => {
      setFavorites((prev) => {
        const updated = prev.filter((fav) => fav.path !== path);
        const key = getStorageKey(paneType, volumeId);
        localStorage.setItem(key, JSON.stringify(updated));
        return updated;
      });
    },
    [paneType, volumeId]
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


