/**
 * Central resolver for audio blobs by path.
 * Handles both local paths (via fileSystemService) and remote paths (via audition cache).
 */
import type { FileSystemResult } from "./fileSystem";
import type { PaneType } from "./fileSystem";
import { fileSystemService } from "./fileSystem";
import { getOrFetchRemoteSample } from "./audition-cache";

const REMOTE_PREFIX = "remote://sample/";

export function isRemotePath(path: string): boolean {
  return path.startsWith(REMOTE_PREFIX);
}

function parseRemoteSampleId(path: string): string | null {
  if (!path.startsWith(REMOTE_PREFIX)) return null;
  const id = path.slice(REMOTE_PREFIX.length).split("/")[0];
  return id || null;
}

/**
 * Get an audio blob URL for the given path.
 * For remote://sample/{id} paths, fetches from audition cache.
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
  return fileSystemService.getAudioFileBlob(path, paneType);
}
