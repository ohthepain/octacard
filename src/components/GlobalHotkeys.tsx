import { useHotkey } from "@tanstack/react-hotkeys";
import { useProjectStore, setSkipHistoryForUndoRedo } from "@/stores/project-store";

function toggleZenMode() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

export function GlobalHotkeys() {
  const hasProject = Boolean(useProjectStore((s) => s.id));
  const { undo, redo } = useProjectStore.temporal.getState();

  useHotkey("Mod+Enter", toggleZenMode, { preventDefault: true });
  useHotkey(
    "Mod+Z",
    () => {
      setSkipHistoryForUndoRedo(true);
      try {
        undo();
      } finally {
        setSkipHistoryForUndoRedo(false);
      }
    },
    { preventDefault: hasProject },
  );
  useHotkey(
    "Mod+Shift+Z",
    () => {
      setSkipHistoryForUndoRedo(true);
      try {
        redo();
      } finally {
        setSkipHistoryForUndoRedo(false);
      }
    },
    { preventDefault: hasProject },
  );

  return null;
}
