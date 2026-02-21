import { useCallback } from "react";
import {
  favoritesStore,
  type Favorite,
  useFavoritesSelector,
  type FavoritePaneType,
} from "@/stores/favorites-store";

export type { Favorite };

/**
 * Hook for managing favorites per pane type (source/dest) and per volume.
 * Backed by a centralized persisted store.
 */
export function useFavorites(paneType: FavoritePaneType, volumeId: string) {
  const favorites = useFavoritesSelector((state) => state.favoritesByVolume[`${paneType}__${volumeId || "_default"}`] ?? []);

  const addFavorite = useCallback(
    (path: string, name: string) => {
      favoritesStore.addFavorite(paneType, volumeId, path, name);
    },
    [paneType, volumeId],
  );

  const removeFavorite = useCallback(
    (path: string) => {
      favoritesStore.removeFavorite(paneType, volumeId, path);
    },
    [paneType, volumeId],
  );

  const isFavorite = useCallback(
    (path: string) => {
      return favoritesStore.isFavorite(paneType, volumeId, path);
    },
    [paneType, volumeId],
  );

  return {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
  };
}
