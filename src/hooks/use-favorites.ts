import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "octacard_favorites";

export interface Favorite {
  path: string;
  name: string;
}

/**
 * Hook for managing favorites per pane
 */
export function useFavorites(paneName: string) {
  const [favorites, setFavorites] = useState<Favorite[]>([]);

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      const key = `${STORAGE_KEY}_${paneName}`;
      const saved = localStorage.getItem(key);
      if (saved) {
        const parsed = JSON.parse(saved) as Favorite[];
        setFavorites(parsed);
      }
    } catch (error) {
      console.error("Failed to load favorites:", error);
    }
  }, [paneName]);

  // Save favorites to localStorage whenever they change
  const saveFavorites = useCallback(
    (newFavorites: Favorite[]) => {
      try {
        const key = `${STORAGE_KEY}_${paneName}`;
        localStorage.setItem(key, JSON.stringify(newFavorites));
        setFavorites(newFavorites);
      } catch (error) {
        console.error("Failed to save favorites:", error);
      }
    },
    [paneName]
  );

  const addFavorite = useCallback(
    (path: string, name: string) => {
      const newFavorite: Favorite = { path, name };
      const updated = [...favorites, newFavorite];
      // Remove duplicates based on path
      const unique = Array.from(
        new Map(updated.map((fav) => [fav.path, fav])).values()
      );
      saveFavorites(unique);
    },
    [favorites, saveFavorites]
  );

  const removeFavorite = useCallback(
    (path: string) => {
      const updated = favorites.filter((fav) => fav.path !== path);
      saveFavorites(updated);
    },
    [favorites, saveFavorites]
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


