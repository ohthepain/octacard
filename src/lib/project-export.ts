/**
 * Export project pack to folder (FS API) or zip download (no FS API).
 */
import JSZip from "jszip";
import { hasDirectoryPickerSupport } from "./browserSupport";
import { fileSystemService } from "./fileSystem";
import { downloadRemoteSampleBlob } from "./remote-library";
import { fromTempPath, getFile, isTempPath } from "./temp-files-store";
import { parseRemoteSampleId } from "./audio-resolver";
import type { ProjectDocument } from "./project-document";
import { sanitizeFilenameMinimal } from "./filename";

/** Pack export config - from Pack model or inline when exporting from project */
export interface PackExportConfig {
  packId: string;
  name: string;
  includeSamples: string[];
  includeStacks: boolean;
  coverImageS3Key?: string;
  ownerName?: string;
}

export interface ExportSampleRef {
  path: string;
  name: string;
  relativePath: string;
}

function getSampleRefsFromPackSettings(
  project: ProjectDocument,
  packSettings: PackExportConfig,
): ExportSampleRef[] {
  const refs: ExportSampleRef[] = [];
  const seen = new Set<string>();

  for (const path of packSettings.includeSamples) {
    if (seen.has(path)) continue;
    seen.add(path);
    const name = path.split("/").filter(Boolean).pop() ?? path;
    refs.push({ path, name, relativePath: name });
  }

  if (packSettings.includeStacks) {
    const activeStack = project.stacks.find((s) => s.id === project.activeStackId) ?? project.stacks[0];
    const slots = activeStack?.slots ?? [];
    for (const slot of slots) {
      if (!slot || seen.has(slot.path)) continue;
      seen.add(slot.path);
      refs.push({ path: slot.path, name: slot.name, relativePath: slot.name });
    }
  }

  return refs;
}

async function resolvePathToBlob(
  path: string,
  paneType: "source" | "dest" = "source",
): Promise<Blob | null> {
  const sampleId = parseRemoteSampleId(path);
  if (sampleId) {
    const blob = await getCachedBlob(sampleId);
    if (blob) return blob;
    const downloaded = await downloadRemoteSampleBlob(sampleId);
    return downloaded;
  }

  if (isTempPath(path)) {
    const virtualPath = fromTempPath(path);
    if (!virtualPath) return null;
    return await getFile(virtualPath);
  }

  const file = await fileSystemService.getFile(path, paneType);
  return file;
}

export async function exportProjectPackToFolder(
  project: ProjectDocument,
  packSettings: PackExportConfig,
  destinationPath: string,
  paneType: "source" | "dest" = "dest",
): Promise<{ success: boolean; error?: string; count?: number }> {
  const refs = getSampleRefsFromPackSettings(project, packSettings);
  if (refs.length === 0) {
    return { success: false, error: "No samples to export" };
  }

  const dirPath = destinationPath.substring(0, destinationPath.lastIndexOf("/")) || "/";
  const folderName = destinationPath.substring(destinationPath.lastIndexOf("/") + 1);
  const createResult = await fileSystemService.createFolder(dirPath, folderName, paneType);
  if (!createResult.success) {
    return { success: false, error: createResult.error ?? "Could not create export folder" };
  }

  let count = 0;
  for (const ref of refs) {
    const blob = await resolvePathToBlob(ref.path, paneType);
    if (!blob) continue;

    const safeName = sanitizeFilenameMinimal(ref.name) || "sample";
    const targetPath = `${destinationPath}/${safeName}`;
    const result = await fileSystemService.writeBlobToPath(targetPath, blob, paneType);
    if (result.success) count++;
  }

  if (count === 0) {
    return { success: false, error: "Could not write any files" };
  }

  const packJson = {
    packId: packSettings.packId,
    name: packSettings.name,
    coverImageS3Key: packSettings.coverImageS3Key,
    ownerName: packSettings.ownerName,
  };
  const packJsonBlob = new Blob([JSON.stringify(packJson, null, 2)], {
    type: "application/json",
  });
  await fileSystemService.writeBlobToPath(
    `${destinationPath}/pack.json`,
    packJsonBlob,
    paneType,
  );

  return { success: true, count };
}

export async function exportProjectPackToZip(
  project: ProjectDocument,
  packSettings: PackExportConfig,
  zipFileName: string,
): Promise<{ success: boolean; error?: string }> {
  const refs = getSampleRefsFromPackSettings(project, packSettings);
  if (refs.length === 0) {
    return { success: false, error: "No samples to export" };
  }

  const zip = new JSZip();
  let hasAny = false;

  for (const ref of refs) {
    const blob = await resolvePathToBlob(ref.path, "source");
    if (!blob) continue;

    const safeName = sanitizeFilenameMinimal(ref.name) || "sample";
    zip.file(safeName, blob);
    hasAny = true;
  }

  if (!hasAny) {
    return { success: false, error: "Could not resolve any files" };
  }

  const packJson = {
    packId: packSettings.packId,
    name: packSettings.name,
    coverImageS3Key: packSettings.coverImageS3Key,
    ownerName: packSettings.ownerName,
  };
  zip.file("pack.json", JSON.stringify(packJson, null, 2));

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFileName.endsWith(".zip") ? zipFileName : `${zipFileName}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  return { success: true };
}

export async function exportProjectPack(
  project: ProjectDocument,
  packSettings: PackExportConfig,
  options?: {
    destinationPath?: string;
    paneType?: "source" | "dest";
    useFolderPicker?: boolean;
  },
): Promise<{ success: boolean; error?: string }> {
  const hasFs = hasDirectoryPickerSupport();
  const useFolder = options?.useFolderPicker ?? hasFs;

  if (useFolder && hasFs) {
    const destPath = options?.destinationPath;
    if (!destPath) {
      return { success: false, error: "Destination path required for folder export" };
    }
    const result = await exportProjectPackToFolder(
      project,
      packSettings,
      destPath,
      options?.paneType ?? "dest",
    );
    return result.success ? { success: true } : { success: false, error: result.error };
  }

  return exportProjectPackToZip(project, packSettings, packSettings.name);
}
