/**
 * Undo/Redo buttons - uses Liveblocks room history when in a room.
 */
import { Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRoomStore } from "@/stores/room-store";

export function UndoRedoButtons() {
  const room = useRoomStore((s) => s.room);

  if (!room) return null;

  const undo = () => room.history.undo();
  const redo = () => room.history.redo();
  const canUndo = room.history.canUndo();
  const canRedo = room.history.canRedo();

  return (
    <div className="flex items-center gap-1">
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
