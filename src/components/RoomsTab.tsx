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
import { useSession } from "@/lib/auth-client";

function getProjectCoverDisplayUrl(
  projectId: string | null,
  coverImageS3Key: string | null,
  coverImageUrl: string | null,
): string | null {
  if (coverImageS3Key && projectId) {
    return `/api/projects/${encodeURIComponent(projectId)}/cover?v=${encodeURIComponent(coverImageS3Key)}`;
  }
  if (coverImageUrl) return coverImageUrl;
  return null;
}

export interface PublicRoomInfo {
  roomId: string;
  projectId: string;
  projectName: string;
  participantCount: number;
  coverImageUrl?: string | null;
  creatorId?: string | null;
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
  const roomsRefreshVersion = useRoomsRefreshStore((s) => s.version);
  const loadProjectFromRoomStorage = useCurrentProjectStore((s) => s.loadProjectFromRoomStorage);
  const persistToBackend = useCurrentProjectStore((s) => s.persistToBackend);
  const enterRoom = useRoomStore((s) => s.enterRoom);
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const isInRoom = useRoomStore((s) => s.isInRoom);
  const roomId = useRoomStore((s) => s.roomId);
  const { data: session } = useSession();

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
  }, [fetchRooms, roomsRefreshVersion]);

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
            const coverUrl = getProjectCoverDisplayUrl(projectId, coverImageS3Key, coverImageUrl);
            await apiFetch("/api/rooms/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                roomId: `project-${projectId}`,
                projectId,
                projectName: projectName?.trim() ?? "Untitled",
                participantCount: 1,
                coverImageUrl: coverUrl,
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

  const currentRoom = roomId ? rooms.find((r) => r.roomId === roomId) : undefined;
  const amCreator = Boolean(currentRoom?.creatorId && session?.user?.id && currentRoom.creatorId === session.user.id);

  const handleLeaveOrCloseRoom = async () => {
    await persistToBackend();
    if (amCreator && roomId) {
      try {
        await apiFetch("/api/rooms/unregister", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ roomId }),
        });
      } catch {
        // Non-fatal
      }
      toast.success("Room closed");
    } else {
      toast.success("Left room");
    }
    leaveRoom();
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
          <Button size="sm" variant="outline" onClick={handleLeaveOrCloseRoom}>
            {amCreator ? "Close room" : "Leave room"}
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
            {rooms.map((room) => {
              const inThisRoom = room.roomId === roomId;
              const createdThisRoom = Boolean(room.creatorId && session?.user?.id && room.creatorId === session.user.id);
              const roomButtonLabel = createdThisRoom ? "Close room" : inThisRoom ? "Leave room" : "Join";
              const roomButtonAction = createdThisRoom || inThisRoom
                ? handleLeaveOrCloseRoom
                : () => handleJoinRoom(room.roomId, room.projectId);
              const roomButtonDisabled = (createdThisRoom || inThisRoom) ? false : creating || isInRoom;

              return (
                <li
                  key={room.roomId}
                  className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-muted/30"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {room.coverImageUrl ? (
                      <img
                        src={room.coverImageUrl}
                        alt=""
                        className="w-10 h-10 rounded object-cover shrink-0"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-muted shrink-0 flex items-center justify-center">
                        <Users className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{room.projectName}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Users className="w-3 h-3" />
                        {room.participantCount} participant{room.participantCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={roomButtonAction}
                    disabled={roomButtonDisabled}
                  >
                    {roomButtonLabel}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
