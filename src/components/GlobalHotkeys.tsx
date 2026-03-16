import { useHotkey } from "@tanstack/react-hotkeys";
import { useRoomStore } from "@/stores/room-store";

function toggleZenMode() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

export function GlobalHotkeys() {
  const room = useRoomStore((s) => s.room);

  useHotkey("Mod+Enter", toggleZenMode, { preventDefault: true });
  useHotkey(
    "Mod+Z",
    () => {
      room?.history.undo();
    },
    { preventDefault: !!room },
  );
  useHotkey(
    "Mod+Shift+Z",
    () => {
      room?.history.redo();
    },
    { preventDefault: !!room },
  );

  return null;
}
