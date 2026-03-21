/**
 * Central resolver for audio blobs by path.
 * Handles local paths (via fileSystemService), remote paths (via audition cache),
 * and temp paths (via temp-files-store).
 */

import { getOrFetchRemoteSample } from "./audition-cache";
import type { FileSystemResult, PaneType } from "./fileSystem";
import { fileSystemService } from "./fileSystem";
import { fromTempPath, getFile, isTempPath } from "./temp-files-store";

const REMOTE_PREFIX = "remote://sample/";

export function isRemotePath(path: string): boolean {
  return path.startsWith(REMOTE_PREFIX);
}

export function parseRemoteSampleId(path: string): string | null {
  if (!path.startsWith(REMOTE_PREFIX)) return null;
  const id = path.slice(REMOTE_PREFIX.length).split("/")[0];
  return id || null;
}

/**
 * Get an audio blob URL for the given path.
 * For remote://sample/{id} paths, fetches from audition cache.
 * For temp:/// paths, reads from temp-files-store.
 * For local paths, delegates to fileSystemService.
 */
export async function getAudioBlobForPath(
  path: string,
  paneType: PaneType,
): Promise<FileSystemResult<string>> {
  const sampleId = parseRemoteSampleId(path);
  if (sampleId) {
    try {
      const fileName = path.split("/").pop() ?? "sample";
      const { objectUrl } = await getOrFetchRemoteSample(sampleId, fileName);
      return { success: true, data: objectUrl };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  if (isTempPath(path)) {
    const virtualPath = fromTempPath(path);
    if (!virtualPath) {
      return { success: false, error: "Invalid temp path" };
    }
    const blob = await getFile(virtualPath);
    if (!blob) {
      return { success: false, error: "File not found in Temp Files" };
    }
    const objectUrl = URL.createObjectURL(blob);
    return { success: true, data: objectUrl };
  }

  if (path.startsWith("dest:")) {
    const inner = path.slice("dest:".length);
    return fileSystemService.getAudioFileBlob(inner, "dest");
  }

  return fileSystemService.getAudioFileBlob(path, paneType);
}
