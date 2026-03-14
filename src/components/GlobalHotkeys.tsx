import { useHotkey } from "@tanstack/react-hotkeys";

function toggleZenMode() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

export function GlobalHotkeys() {
  useHotkey("Mod+Enter", toggleZenMode, { preventDefault: true });
  return null;
}
