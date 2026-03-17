/**
 * Rooms tab: list public rooms, create room, join room.
 */
import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Users, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRoomStore } from "@/stores/room-store";
import { useCurrentProjectStore } from "@/stores/current-project-store";
import { useProjectStore } from "@/stores/project-store";
import { useProjectSettingsStore } from "@/stores/project-settings-store";
import { useRoomsRefreshStore } from "@/stores/rooms-refresh-store";
import { hasLiveblocksConfig } from "@/lib/liveblocks-client";
import { apiFetch } from "@/lib/api-client";

export interface PublicRoomInfo {
  roomId: string;
  projectId: string;
  projectName: string;
  participantCount: number;
}

export function RoomsTab() {
  const [rooms, setRooms] = useState<PublicRoomInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const projectId = useProjectStore((s) => s.id);
  const projectName = useProjectStore((s) => s.name);
  const coverImageS3Key = useProjectStore((s) => s.coverImageS3Key);
  const coverImageUrl = useProjectStore((s) => s.coverImageUrl);
  const getProjectDocument = useCurrentProjectStore((s) => s.getProjectDocument);
  const requestOpenProjectSettings = useProjectSettingsStore((s) => s.requestOpen);
  const triggerRoomsRefresh = useRoomsRefreshStore((s) => s.triggerRefresh);
  const loadProjectFromRoomStorage = useCurrentProjectStore((s) => s.loadProjectFromRoomStorage);
  const persistToBackend = useCurrentProjectStore((s) => s.persistToBackend);
  const enterRoom = useRoomStore((s) => s.enterRoom);
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const isInRoom = useRoomStore((s) => s.isInRoom);

  const fetchRooms = useCallback(async () => {
    if (!hasLiveblocksConfig()) return;
    setLoading(true);
    try {
      const res = await apiFetch("/api/rooms/public");
      if (res.ok) {
        const data = (await res.json()) as { rooms: PublicRoomInfo[] };
        setRooms(data.rooms ?? []);
      } else {
        setRooms([]);
      }
    } catch {
      setRooms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRooms();
  }, [fetchRooms]);

  const hasProjectNameAndImage =
    projectName?.trim() &&
    projectName.trim() !== "Untitled" &&
    Boolean(coverImageS3Key || coverImageUrl);

  const handleCreateRoom = async () => {
    if (!projectId) {
      toast.error("Create a project first");
      requestOpenProjectSettings();
      return;
    }
    if (!projectName?.trim() || projectName.trim() === "Untitled") {
      toast.error("Give your project a name before creating a room");
      requestOpenProjectSettings();
      return;
    }
    if (!coverImageS3Key && !coverImageUrl) {
      toast.error("Add a cover image to your project before creating a room");
      requestOpenProjectSettings();
      return;
    }
    if (!hasLiveblocksConfig()) {
      toast.error("Collaboration is not configured");
      return;
    }

    const initialProject = getProjectDocument();
    setCreating(true);
      try {
        const ok = await enterRoom(projectId, initialProject ?? undefined);
        if (ok) {
          await loadProjectFromRoomStorage();
          try {
            await apiFetch("/api/rooms/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomId: `project-${projectId}`,
                projectId,
                projectName: projectName?.trim() ?? "Untitled",
                participantCount: 1,
              }),
            });
          } catch {
            // Non-fatal
          }
          toast.success("Room created");
          triggerRoomsRefresh();
          void fetchRooms();
        } else {
          toast.error("Failed to create room");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleJoinRoom = async (_roomId: string, projectId: string) => {
    if (!hasLiveblocksConfig()) {
      toast.error("Collaboration is not configured");
      return;
    }

    leaveRoom();
    setCreating(true);
    try {
      const ok = await enterRoom(projectId);
      if (ok) {
        const loaded = await loadProjectFromRoomStorage();
        if (loaded) {
          toast.success("Joined room");
        } else {
          toast.error("Could not load project from room");
        }
      } else {
        toast.error("Failed to join room");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleLeaveRoom = async () => {
    await persistToBackend();
    try {
      await apiFetch("/api/rooms/unregister", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: `project-${projectId}` }),
      });
    } catch {
      // Non-fatal
    }
    leaveRoom();
    toast.success("Left room");
    triggerRoomsRefresh();
    void fetchRooms();
  };

  if (!hasLiveblocksConfig()) {
    return (
      <div className="h-full border border-border rounded-lg p-4 text-sm text-muted-foreground bg-card">
        Collaboration requires Liveblocks configuration (VITE_LIVEBLOCKS_PUBLIC_KEY).
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col border border-border rounded-lg bg-card">
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="font-semibold">Rooms</h2>
        {isInRoom ? (
          <Button size="sm" variant="outline" onClick={handleLeaveRoom}>
            Leave room
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={handleCreateRoom}
            disabled={creating || !hasProjectNameAndImage}
            aria-label="Create room"
          >
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
            Create room
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4">
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading rooms...
          </div>
        ) : rooms.length === 0 ? (
          <div className="text-sm text-muted-foreground">
            No public rooms at the moment. Create a room to collaborate.
          </div>
        ) : (
          <ul className="space-y-2">
            {rooms.map((room) => (
              <li
                key={room.roomId}
                className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30"
              >
                <div className="min-w-0">
                  <div className="font-medium truncate">{room.projectName}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    {room.participantCount} participant{room.participantCount !== 1 ? "s" : ""}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => handleJoinRoom(room.roomId, room.projectId)}
                  disabled={creating || isInRoom}
                >
                  Join
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
