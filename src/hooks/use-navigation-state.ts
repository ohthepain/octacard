import { useCallback } from "react";

const STORAGE_KEY_PREFIX = "octacard_nav_state_";

interface NavigationState {
  currentPath: string;
  expandedFolders: string[];
}

const DEFAULT_VOLUME_KEY = "_default";

function getStorageKey(paneName: string, volumeUUID?: string | null): string {
  return `${STORAGE_KEY_PREFIX}${paneName}_${volumeUUID ?? DEFAULT_VOLUME_KEY}`;
}

/**
 * Hook for managing navigation state per pane per volume UUID
 */
export function useNavigationState(paneName: string) {
  /**
   * Save navigation state for a pane and volume UUID
   */
  const saveNavigationState = useCallback(
    (volumeUUID: string | null | undefined, folderPath: string, expandedFolders: Set<string>) => {
      try {
        console.log("Saving navigation state for pane:", paneName, "volume:", volumeUUID, "path:", folderPath);
        const key = getStorageKey(paneName, volumeUUID);
        const state: NavigationState = {
          currentPath: folderPath,
          expandedFolders: Array.from(expandedFolders),
        };
        localStorage.setItem(key, JSON.stringify(state));
      } catch (error) {
        console.error("Failed to save navigation state:", error);
      }
    },
    [paneName]
  );

  /**
   * Get saved navigation state for a pane and volume UUID
   */
  const getNavigationState = useCallback(
    (volumeUUID: string | null | undefined): NavigationState | null => {
      try {
        const key = getStorageKey(paneName, volumeUUID);
        const saved = localStorage.getItem(key);
        if (!saved) return null;

        const parsed = JSON.parse(saved) as NavigationState;
        // Handle legacy format (just a string path)
        if (typeof parsed === "string") {
          return {
            currentPath: parsed,
            expandedFolders: [],
          };
        }
        return parsed;
      } catch (error) {
        console.error("Failed to get navigation state:", error);
        return null;
      }
    },
    [paneName]
  );

  /**
   * Clear navigation state for a pane and volume UUID
   */
  const clearNavigationState = useCallback(
    (volumeUUID: string | null | undefined) => {
      try {
        const key = getStorageKey(paneName, volumeUUID);
        localStorage.removeItem(key);
      } catch (error) {
        console.error("Failed to clear navigation state:", error);
      }
    },
    [paneName]
  );

  return {
    saveNavigationState,
    getNavigationState,
    clearNavigationState,
  };
}
