import { useCallback } from "react";
import {
  favoritesStore,
  getFavoritesVolumeKey,
  type AddFavoriteInput,
  type Favorite,
  useFavoritesSelector,
  type FavoritePaneType,
} from "@/stores/favorites-store";

export type { Favorite, AddFavoriteInput };

const EMPTY_FAVORITES: Favorite[] = [];

/**
 * Hook for managing favorites per pane type (source/dest) and per volume.
 * Backed by a centralized persisted store.
 */
export function useFavorites(paneType: FavoritePaneType, volumeId: string) {
  const volumeKey = getFavoritesVolumeKey(paneType, volumeId);
  const favorites = useFavoritesSelector(
    (state) => state.favoritesByVolume[volumeKey] ?? EMPTY_FAVORITES,
  );

  const addFavorite = useCallback(
    (input: AddFavoriteInput) => {
      favoritesStore.addFavorite(paneType, volumeId, input);
    },
    [paneType, volumeId],
  );

  /** Path-based shortcut (under current library / dest root). */
  const addVirtualPathFavorite = useCallback(
    (path: string, name: string) => {
      favoritesStore.addFavorite(paneType, volumeId, { kind: "virtualPath", path, name });
    },
    [paneType, volumeId],
  );

  const removeFavorite = useCallback(
    (favoriteId: string) => {
      favoritesStore.removeFavorite(paneType, volumeId, favoriteId);
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
    addVirtualPathFavorite,
    removeFavorite,
    isFavorite,
  };
}
