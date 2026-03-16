/**
 * Subscribe to Liveblocks room storage and hydrate Zustand stores when projectJson changes.
 * Handles undo/redo and remote edits by syncing storage back to local state.
 */
import { useEffect } from "react";
import { useRoomStore } from "@/stores/room-store";
import { useCurrentProjectStore } from "@/stores/current-project-store";
import { shouldIgnoreStorageUpdate } from "@/lib/liveblocks-project-sync";

export function useRoomStorageSync(): void {
  const room = useRoomStore((s) => s.room);
  const loadProjectFromRoomStorage = useCurrentProjectStore((s) => s.loadProjectFromRoomStorage);

  useEffect(() => {
    if (!room) return;

    let unsub: (() => void) | null = null;

    void (async () => {
      try {
        const { root } = await room.getStorage();
        unsub = room.subscribe(root, () => {
          if (shouldIgnoreStorageUpdate()) return;
          void loadProjectFromRoomStorage();
        });
      } catch {
        // Storage not ready or room disconnected
      }
    })();

    return () => {
      unsub?.();
    };
  }, [room, loadProjectFromRoomStorage]);
}
