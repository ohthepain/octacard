/**
 * Undo/Redo buttons - uses Liveblocks room history when in a room.
 * Always visible; disabled when no project or no room.
 */
import { Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRoomStore } from "@/stores/room-store";
import { useProjectStore } from "@/stores/project-store";

export function UndoRedoButtons() {
  const room = useRoomStore((s) => s.room);
  const hasProject = Boolean(useProjectStore((s) => s.id));

  const undo = () => room?.history.undo();
  const redo = () => room?.history.redo();
  const canUndo = hasProject && (room?.history.canUndo() ?? false);
  const canRedo = hasProject && (room?.history.canRedo() ?? false);

  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Undo"
      >
        <Undo2 className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Redo"
      >
        <Redo2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
