import { useCallback } from "react";

const STORAGE_KEY_PREFIX = "octacard_nav_state_";

interface NavigationState {
  currentPath: string;
  expandedFolders: string[];
}

/**
 * Hook for managing navigation state per pane per volume UUID
 */
export function useNavigationState(paneName: string) {
  /**
   * Save navigation state for a pane and volume UUID
   */
  const saveNavigationState = useCallback(
    (volumeUUID: string, folderPath: string, expandedFolders: Set<string>) => {
      try {
        console.log("Saving navigation state for pane:", paneName, "volume:", volumeUUID, "path:", folderPath);
        const key = `${STORAGE_KEY_PREFIX}${paneName}_${volumeUUID}`;
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
    (volumeUUID: string): NavigationState | null => {
      try {
        const key = `${STORAGE_KEY_PREFIX}${paneName}_${volumeUUID}`;
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
    (volumeUUID: string) => {
      try {
        const key = `${STORAGE_KEY_PREFIX}${paneName}_${volumeUUID}`;
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
