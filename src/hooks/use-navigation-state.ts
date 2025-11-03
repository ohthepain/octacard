import { useCallback } from "react";

const STORAGE_KEY_PREFIX = "octacard_nav_state_";

/**
 * Hook for managing navigation state per volume UUID
 */
export function useNavigationState() {
  /**
   * Save navigation state for a volume UUID
   */
  const saveNavigationState = useCallback((volumeUUID: string, folderPath: string) => {
    try {
      console.log("Saving navigation state for volume:", volumeUUID, "path:", folderPath);
      const key = `${STORAGE_KEY_PREFIX}${volumeUUID}`;
      localStorage.setItem(key, folderPath);
    } catch (error) {
      console.error("Failed to save navigation state:", error);
    }
  }, []);

  /**
   * Get saved navigation state for a volume UUID
   */
  const getNavigationState = useCallback((volumeUUID: string): string | null => {
    try {
      const key = `${STORAGE_KEY_PREFIX}${volumeUUID}`;
      return localStorage.getItem(key);
    } catch (error) {
      console.error("Failed to get navigation state:", error);
      return null;
    }
  }, []);

  /**
   * Clear navigation state for a volume UUID
   */
  const clearNavigationState = useCallback((volumeUUID: string) => {
    try {
      const key = `${STORAGE_KEY_PREFIX}${volumeUUID}`;
      localStorage.removeItem(key);
    } catch (error) {
      console.error("Failed to clear navigation state:", error);
    }
  }, []);

  return {
    saveNavigationState,
    getNavigationState,
    clearNavigationState,
  };
}
