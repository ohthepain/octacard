/**
 * Resolve a dropped File to a path usable in the project.
 * Branches on FS API availability and room/collaboration mode.
 */
import { hasDirectoryPickerSupport } from "./browserSupport";
import { fileSystemService } from "./fileSystem";
import { putFile, toTempPath } from "./temp-files-store";
import { TEMP_FILES_ROOT } from "./temp-files-store";
import { sanitizeFilenameMinimal } from "./filename";

export interface ResolveFileDropOptions {
  /** When true, upload to remote (for room collaboration) instead of local/temp */
  inRoom?: boolean;
  /** Virtual path for temp store (e.g. "/Temp Files" or subfolder) */
  tempBasePath?: string;
  /** Pane type for FS API (source vs dest) */
  paneType?: "source" | "dest";
}

export interface ResolveFileDropResult {
  success: boolean;
  path?: string;
  name?: string;
  error?: string;
}

/**
 * Resolve a dropped file to a path.
 * - FS API + local: addFileFromDrop → local path
 * - No FS API + local: put in temp store → temp:// path
 * - In room: upload to S3 → remote://sample/id (implemented in room flow)
 */
export async function resolveFileDrop(
  file: File,
  options: ResolveFileDropOptions = {},
): Promise<ResolveFileDropResult> {
  let { inRoom = false, tempBasePath = TEMP_FILES_ROOT, paneType = "source" } = options;
  if (!inRoom && typeof window !== "undefined") {
    const { useRoomStore } = await import("@/stores/room-store");
    inRoom = useRoomStore.getState().isInRoom;
  }

  const safeName = sanitizeFilenameMinimal(file.name) || "upload";

  if (inRoom) {
    return resolveFileDropInRoom(file, safeName);
  }

  if (hasDirectoryPickerSupport() && fileSystemService.hasRootForPane(paneType)) {
    const result = await fileSystemService.addFileFromDrop(file, "/", paneType);
    if (result.success && result.data) {
      const path = result.data;
      const name = path.split("/").filter(Boolean).pop() ?? safeName;
      return { success: true, path, name };
    }
    return { success: false, error: result.error };
  }

  const virtualPath = `${tempBasePath}/${safeName}`;
  await putFile(virtualPath, file, safeName);
  const tempPath = toTempPath(virtualPath);
  return { success: true, path: tempPath, name: safeName };
}

async function resolveFileDropInRoom(
  file: File,
  safeName: string,
): Promise<ResolveFileDropResult> {
  try {
    const { createSampleUploadUrl, completeSampleCreate } = await import("./remote-library");
    const { getOrCreateProjectPackId } = await import("./project-upload-pack");

    const packId = await getOrCreateProjectPackId();
    if (!packId) {
      return { success: false, error: "No pack available for upload" };
    }

    const contentType = file.type || "audio/wav";
    const { key, uploadUrl } = await createSampleUploadUrl({
      packId,
      fileName: safeName,
      contentType,
      sizeBytes: file.size,
      credits: 0,
    });

    const uploadRes = await fetch(uploadUrl, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": contentType },
    });
    if (!uploadRes.ok) {
      return { success: false, error: `Upload failed: ${uploadRes.status}` };
    }

    const sample = await completeSampleCreate({
      packId,
      name: safeName,
      s3Key: key,
      contentType,
      sizeBytes: file.size,
      credits: 0,
    });

    return {
      success: true,
      path: `remote://sample/${sample.id}`,
      name: safeName,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
