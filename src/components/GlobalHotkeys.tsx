import { useHotkey } from "@tanstack/react-hotkeys";
import { useProjectStore, setSkipHistoryForUndoRedo } from "@/stores/project-store";
import { useWaveformEditorStore } from "@/stores/waveform-editor-store";

function isAudioFile(fileName: string): boolean {
  return /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i.test(fileName);
}

function toggleZenMode() {
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {});
  } else {
    document.documentElement.requestFullscreen().catch(() => {});
  }
}

function toggleWaveformEditor() {
  const we = useWaveformEditorStore.getState();
  if (we.enabled) {
    we.setEnabled(false);
    return;
  }
  we.setEnabled(true);
  const previewMode = useProjectStore.getState().getActiveStack()?.previewMode ?? "single";
  if (previewMode === "multi") {
    const active = useProjectStore.getState().getActiveStack();
    const slots = active?.slots ?? [];
    const activeSlotIndex = active?.activeSlotIndex ?? 0;
    const sample = slots[activeSlotIndex];
    if (sample && isAudioFile(sample.name)) {
      we.openWithFileFromMulti(sample.path, sample.name, sample.paneType, sample.id);
      return;
    }
  }
  we.open();
}

export function GlobalHotkeys() {
  const hasProject = Boolean(useProjectStore((s) => s.id));
  const { undo, redo } = useProjectStore.temporal.getState();

  useHotkey("Mod+Enter", toggleZenMode, { preventDefault: true });
  useHotkey("Mod+E", toggleWaveformEditor, { preventDefault: true });
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
