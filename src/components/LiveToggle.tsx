/**
 * Live toggle: go live (join Liveblocks room) or go offline.
 * Requires project name and image to go live; otherwise shows warning and opens project settings.
 */
import { useState } from "react";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useProjectStore } from "@/stores/project-store";
import { useRoomStore } from "@/stores/room-store";
import { useCurrentProjectStore } from "@/stores/current-project-store";
import { useProjectSettingsStore } from "@/stores/project-settings-store";
import { useRoomsRefreshStore } from "@/stores/rooms-refresh-store";
import { hasLiveblocksConfig } from "@/lib/liveblocks-client";
import { apiFetch } from "@/lib/api-client";
import { toast } from "sonner";

function hasProjectNameAndImage(
  name: string | null,
  coverImageS3Key: string | null,
  coverImageUrl: string | null,
): boolean {
  const trimmed = name?.trim();
  if (!trimmed || trimmed === "Untitled") return false;
  return Boolean(coverImageS3Key || coverImageUrl);
}

export function LiveToggle() {
  const [warningOpen, setWarningOpen] = useState(false);
  const [goingLive, setGoingLive] = useState(false);

  const projectId = useProjectStore((s) => s.id);
  const projectName = useProjectStore((s) => s.name);
  const coverImageS3Key = useProjectStore((s) => s.coverImageS3Key);
  const coverImageUrl = useProjectStore((s) => s.coverImageUrl);

  const isInRoom = useRoomStore((s) => s.isInRoom);
  const ensureProjectRoom = useRoomStore((s) => s.ensureProjectRoom);
  const leaveRoom = useRoomStore((s) => s.leaveRoom);

  const getProjectDocument = useCurrentProjectStore((s) => s.getProjectDocument);
  const loadProjectFromRoomStorage = useCurrentProjectStore((s) => s.loadProjectFromRoomStorage);
  const persistToBackend = useCurrentProjectStore((s) => s.persistToBackend);

  const requestOpenProjectSettings = useProjectSettingsStore((s) => s.requestOpen);
  const triggerRoomsRefresh = useRoomsRefreshStore((s) => s.triggerRefresh);

  if (!hasLiveblocksConfig()) return null;

  const handleToggle = async () => {
    if (isInRoom) {
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
      triggerRoomsRefresh();
      toast.success("Went offline");
      return;
    }

    if (!projectId) {
      toast.error("Create a project first");
      requestOpenProjectSettings();
      return;
    }

    if (!hasProjectNameAndImage(projectName, coverImageS3Key, coverImageUrl)) {
      setWarningOpen(true);
      return;
    }

    setGoingLive(true);
    try {
      const initialProject = getProjectDocument();
      const ok = await ensureProjectRoom(projectId, initialProject ?? undefined);
      if (!ok) {
        toast.error("Failed to go live");
        return;
      }
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
        // Non-fatal - room still works, just won't appear in list
      }
      triggerRoomsRefresh();
      toast.success("You're live");
    } finally {
      setGoingLive(false);
    }
  };

  const handleWarningGoToSettings = () => {
    setWarningOpen(false);
    requestOpenProjectSettings();
  };

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={isInRoom ? "default" : "outline"}
            size="sm"
            aria-pressed={isInRoom}
            aria-label={isInRoom ? "Go offline" : "Go live"}
            data-testid="live-toggle"
            onClick={() => void handleToggle()}
            disabled={goingLive}
          >
            <Radio className="w-4 h-4 mr-1" />
            Live
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>{isInRoom ? "Go offline (leave room)" : "Go live and collaborate!"}</p>
        </TooltipContent>
      </Tooltip>

      <AlertDialog open={warningOpen} onOpenChange={setWarningOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Project needs a name and image</AlertDialogTitle>
            <AlertDialogDescription>
              Give your project a name and add a cover image before going live. Your room will appear in the Rooms list
              for others to find.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button onClick={handleWarningGoToSettings}>Go to project settings</Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
