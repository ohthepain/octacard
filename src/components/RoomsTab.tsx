/**
 * Rooms tab: list public rooms, create room, join room.
 */
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Users, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useRoomStore } from "@/stores/room-store";
import { useCurrentProjectStore } from "@/stores/current-project-store";
import { useProjectStore } from "@/stores/project-store";
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
  const getProjectDocument = useCurrentProjectStore((s) => s.getProjectDocument);
  const loadProjectFromRoomStorage = useCurrentProjectStore((s) => s.loadProjectFromRoomStorage);
  const persistToBackend = useCurrentProjectStore((s) => s.persistToBackend);
  const enterRoom = useRoomStore((s) => s.enterRoom);
  const leaveRoom = useRoomStore((s) => s.leaveRoom);
  const isInRoom = useRoomStore((s) => s.isInRoom);

  useEffect(() => {
    if (!hasLiveblocksConfig()) return;
    setLoading(true);
    void (async () => {
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
    })();
  }, []);

  const handleCreateRoom = async () => {
    if (!projectId) {
      toast.error("Create a project with a name first");
      return;
    }
    if (!projectName?.trim()) {
      toast.error("Give your project a name before creating a room");
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
        const loaded = await loadProjectFromRoomStorage();
        if (loaded) {
          toast.success("Room created");
        }
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
    leaveRoom();
    toast.success("Left room");
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
            disabled={creating || !projectName?.trim()}
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
