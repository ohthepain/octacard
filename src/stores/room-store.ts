/**
 * Room connection state for Liveblocks collaboration.
 */
import { create } from "zustand";
import type { JsonObject } from "@liveblocks/client";
import { liveblocksClient, hasLiveblocksConfig } from "@/lib/liveblocks-client";
import type { Room } from "@liveblocks/client";
import type { ProjectDocument } from "@/lib/project-document";

interface RoomState {
  roomId: string | null;
  room: Room | null;
  leave: (() => void) | null;
  isInRoom: boolean;
  enterRoom: (projectId: string, initialProject?: ProjectDocument | null) => Promise<boolean>;
  /** Auto-enter room for project (single-user undo). Idempotent if already in same room. */
  ensureProjectRoom: (projectId: string, initialProject?: ProjectDocument | null) => Promise<boolean>;
  leaveRoom: () => void;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  roomId: null,
  room: null,
  leave: null,
  isInRoom: false,

  enterRoom: async (projectId: string, initialProject?: ProjectDocument | null) => {
    if (!hasLiveblocksConfig()) return false;

    const roomId = `project-${projectId}`;
    const { roomId: currentRoomId } = get();
    if (currentRoomId === roomId && get().room) return true;

    const { leave: prevLeave } = get();
    if (prevLeave) prevLeave();

    try {
      const options: { initialPresence: JsonObject; initialStorage?: { projectJson: string } } = {
        initialPresence: {} as JsonObject,
      };
      if (initialProject) {
        options.initialStorage = { projectJson: JSON.stringify(initialProject) };
      }
      const { room, leave } = liveblocksClient.enterRoom(roomId, options);
      set({ roomId, room, leave, isInRoom: true });
      return true;
    } catch {
      set({ roomId: null, room: null, leave: null, isInRoom: false });
      return false;
    }
  },

  ensureProjectRoom: async (projectId: string, initialProject?: ProjectDocument | null) => {
    if (!hasLiveblocksConfig()) return false;
    const { roomId: currentRoomId, room } = get();
    const targetRoomId = `project-${projectId}`;
    if (currentRoomId === targetRoomId && room) return true;
    return get().enterRoom(projectId, initialProject);
  },

  leaveRoom: () => {
    const { leave } = get();
    if (leave) leave();
    set({ roomId: null, room: null, leave: null, isInRoom: false });
  },
}));
