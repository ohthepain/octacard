import type { PaneType } from "./fileSystem";

const AUDIO_EXT = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i;

function basenameFromSourceRef(sourceRef: string): string {
  if (sourceRef.startsWith("dest:")) {
    return (
      sourceRef.slice("dest:".length).split("/").filter(Boolean).pop() || ""
    );
  }
  return sourceRef.split("/").filter(Boolean).pop() || sourceRef;
}

/**
 * Pack entries store dest-pane files as `dest:{virtualPath}`; the file browser uses bare paths + pane type.
 * Remote and temp refs are unchanged and always use the source pane for resolution.
 */
export function sourceRefToOpenParams(
  sourceRef: string,
  displayName: string,
): { path: string; paneType: PaneType; name: string } {
  if (sourceRef.startsWith("dest:")) {
    return {
      path: sourceRef.slice("dest:".length),
      paneType: "dest",
      name: displayName,
    };
  }
  return {
    path: sourceRef,
    paneType: "source",
    name: displayName,
  };
}

/** True if this pack entry should open in the wave editor (audio by ref or display name). */
export function isPackEntryAudio(entry: {
  displayName: string;
  sourceRef: string;
}): boolean {
  if (entry.sourceRef.startsWith("remote://sample/")) return true;
  if (entry.sourceRef.startsWith("temp://")) return true;
  if (AUDIO_EXT.test(entry.displayName)) return true;
  return AUDIO_EXT.test(basenameFromSourceRef(entry.sourceRef));
}
