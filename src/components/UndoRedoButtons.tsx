/**
 * Undo/Redo buttons - uses zundo temporal store on project.
 * Always visible; disabled when no project or no history.
 */
import { Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore, setSkipHistoryForUndoRedo } from "@/stores/project-store";
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";

export function UndoRedoButtons() {
  const hasProject = Boolean(useProjectStore((s) => s.id));
  const { undo, redo, pastStates, futureStates } = useStore(
    useProjectStore.temporal,
    useShallow((s) => ({
      undo: s.undo,
      redo: s.redo,
      pastStates: s.pastStates,
      futureStates: s.futureStates,
    })),
  );

  const canUndo = hasProject && pastStates.length > 0;
  const canRedo = hasProject && futureStates.length > 0;

  const handleUndo = () => {
    setSkipHistoryForUndoRedo(true);
    try {
      undo();
    } finally {
      setSkipHistoryForUndoRedo(false);
    }
  };

  const handleRedo = () => {
    setSkipHistoryForUndoRedo(true);
    try {
      redo();
    } finally {
      setSkipHistoryForUndoRedo(false);
    }
  };

  return (
    <div className="flex items-center gap-1 shrink-0">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={handleUndo}
        disabled={!canUndo}
        aria-label="Undo"
      >
        <Undo2 className="w-4 h-4" />
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={handleRedo}
        disabled={!canRedo}
        aria-label="Redo"
      >
        <Redo2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
