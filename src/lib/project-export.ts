/**
 * Export project pack to folder (FS API) or zip download (no FS API).
 */
import JSZip from "jszip";
import { hasDirectoryPickerSupport } from "./browserSupport";
import { fileSystemService } from "./fileSystem";
import { getCachedBlob } from "./audition-cache";
import { downloadRemoteSampleBlob } from "./remote-library";
import { fromTempPath, getFile, isTempPath } from "./temp-files-store";
import { parseRemoteSampleId } from "./audio-resolver";
import type { ProjectDocument } from "./project-document";
import { sanitizeFilenameMinimal } from "./filename";
import { getPackStructure } from "./project-packs";
import { exportAudioWithEdits } from "./exportAudio";

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

function getSampleRefsFromPackSettings(project: ProjectDocument, packSettings: PackExportConfig): ExportSampleRef[] {
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

async function resolvePathToBlob(path: string, paneType: "source" | "dest" = "source"): Promise<Blob | null> {
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

  if (path.startsWith("dest:")) {
    const inner = path.slice("dest:".length);
    const file = await fileSystemService.getFile(inner, "dest");
    return file;
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
  await fileSystemService.writeBlobToPath(`${destinationPath}/pack.json`, packJsonBlob, paneType);

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
    const result = await exportProjectPackToFolder(project, packSettings, destPath, options?.paneType ?? "dest");
    return result.success ? { success: true } : { success: false, error: result.error };
  }

  return exportProjectPackToZip(project, packSettings, packSettings.name);
}

function splitRelativePath(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);
}

export async function exportLocalPackFolderToZip(
  packName: string,
  sourceRootPath: string,
  sourcePaneType: "source" | "dest" = "source",
): Promise<{ success: boolean; error?: string; count?: number }> {
  const result = await fileSystemService.listAudioFilesRecursively(sourceRootPath, sourcePaneType);
  if (!result.success || !result.data) {
    return { success: false, error: result.error ?? "Could not read local pack files" };
  }
  const files = result.data;
  if (files.length === 0) {
    return { success: false, error: "No audio files to export" };
  }

  const normalizedRoot = sourceRootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const prefix = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`;

  const zip = new JSZip();
  let written = 0;
  for (const entry of files) {
    const relativePath = entry.path.startsWith(prefix)
      ? entry.path.slice(prefix.length).replace(/^\/+/, "")
      : entry.name;
    const fileBlob = await resolvePathToBlob(entry.path, sourcePaneType);
    if (!fileBlob) continue;
    const segments = splitRelativePath(relativePath);
    if (segments.length === 0) continue;
    const safeFileName = sanitizeFilenameMinimal(segments.pop() ?? entry.name) || "sample";
    const safeRelativePath = [...segments, safeFileName].join("/");
    zip.file(safeRelativePath, fileBlob);
    written += 1;
  }

  if (written === 0) {
    return { success: false, error: "Could not resolve any files" };
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${sanitizeFilenameMinimal(packName) || "local-pack"}.zip`;
  link.click();
  URL.revokeObjectURL(url);
  return { success: true, count: written };
}

export async function exportLocalPackFolderToFolder(
  packName: string,
  sourceRootPath: string,
  destinationParentPath: string,
  sourcePaneType: "source" | "dest" = "source",
  destinationPaneType: "source" | "dest" = "dest",
): Promise<{ success: boolean; error?: string; count?: number }> {
  const filesResult = await fileSystemService.listAudioFilesRecursively(sourceRootPath, sourcePaneType);
  if (!filesResult.success || !filesResult.data) {
    return { success: false, error: filesResult.error ?? "Could not read local pack files" };
  }
  const files = filesResult.data;
  if (files.length === 0) {
    return { success: false, error: "No audio files to export" };
  }

  const safePackFolder = sanitizeFilenameMinimal(packName) || "local-pack";
  const packDestination = `${destinationParentPath.replace(/\/+$/, "")}/${safePackFolder}`;
  const createRoot = await fileSystemService.createFolder(destinationParentPath, safePackFolder, destinationPaneType);
  if (!createRoot.success) {
    return { success: false, error: createRoot.error ?? "Could not create destination pack folder" };
  }

  const normalizedRoot = sourceRootPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const prefix = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`;

  let written = 0;
  for (const entry of files) {
    const relativePath = entry.path.startsWith(prefix)
      ? entry.path.slice(prefix.length).replace(/^\/+/, "")
      : entry.name;
    const segments = splitRelativePath(relativePath);
    if (segments.length === 0) continue;
    const rawName = segments.pop() ?? entry.name;
    const safeName = sanitizeFilenameMinimal(rawName) || "sample";

    let destinationDir = packDestination;
    for (const segment of segments) {
      const safeSegment = sanitizeFilenameMinimal(segment) || "folder";
      const nextDir = `${destinationDir}/${safeSegment}`;
      const createDir = await fileSystemService.createFolder(destinationDir, safeSegment, destinationPaneType);
      if (!createDir.success) {
        return { success: false, error: createDir.error ?? "Could not create destination folder" };
      }
      destinationDir = nextDir;
    }

    const copyResult = await fileSystemService.copyFile(
      entry.path,
      destinationDir,
      safeName,
      sourcePaneType,
      destinationPaneType,
    );
    if (!copyResult.success) {
      return { success: false, error: copyResult.error ?? `Could not export ${entry.name}` };
    }
    written += 1;
  }

  return { success: true, count: written };
}

export async function exportProjectPackStructureToFolder(
  projectId: string,
  packId: string,
  packName: string,
  destinationParentPath: string,
  destinationPaneType: "source" | "dest" = "dest",
): Promise<{ success: boolean; error?: string; count?: number }> {
  const structure = await getPackStructure(projectId, packId);
  if (structure.entries.length === 0) {
    return { success: false, error: "No samples to export" };
  }

  const safePackFolder = sanitizeFilenameMinimal(packName) || "local-pack";
  const packDestination = `${destinationParentPath.replace(/\/+$/, "")}/${safePackFolder}`;
  const createRoot = await fileSystemService.createFolder(
    destinationParentPath,
    safePackFolder,
    destinationPaneType,
  );
  if (!createRoot.success) {
    return { success: false, error: createRoot.error ?? "Could not create export folder" };
  }

  let written = 0;
  for (const entry of structure.entries) {
    const blob = await resolvePathToBlob(entry.sourceRef, "source");
    if (!blob) continue;

    const { mainBlob } = await exportAudioWithEdits(blob, {
      regionStart: entry.regionStart,
      regionEnd: entry.regionEnd,
    });

    const safeName = sanitizeFilenameMinimal(entry.displayName) || "sample";
    const ext = safeName.includes(".") ? "" : ".wav";
    const folderSegments = buildFolderPathForEntry(entry, structure.folders);

    let destinationDir = packDestination;
    for (const segment of folderSegments) {
      const nextDir = `${destinationDir}/${segment}`;
      const createDir = await fileSystemService.createFolder(destinationDir, segment, destinationPaneType);
      if (!createDir.success) {
        return { success: false, error: createDir.error ?? "Could not create folder" };
      }
      destinationDir = nextDir;
    }

    const targetPath = `${destinationDir}/${safeName}${ext}`;
    const writeResult = await fileSystemService.writeBlobToPath(targetPath, mainBlob, destinationPaneType);
    if (!writeResult.success) continue;
    written += 1;
  }

  if (written === 0) {
    return { success: false, error: "Could not export any samples" };
  }

  const packJson = { name: packName };
  const packJsonBlob = new Blob([JSON.stringify(packJson, null, 2)], { type: "application/json" });
  await fileSystemService.writeBlobToPath(`${packDestination}/pack.json`, packJsonBlob, destinationPaneType);

  return { success: true, count: written };
}

function buildFolderPathForEntry(
  entry: { folderId: string | null },
  folders: Array<{ id: string; parentId: string | null; name: string }>,
): string[] {
  if (!entry.folderId) return [];
  const path: string[] = [];
  let currentId: string | null = entry.folderId;
  while (currentId) {
    const folder = folders.find((f) => f.id === currentId);
    if (!folder) break;
    path.unshift(sanitizeFilenameMinimal(folder.name) || "folder");
    currentId = folder.parentId;
  }
  return path;
}

export async function exportProjectPackStructureToZip(
  projectId: string,
  packId: string,
  packName: string,
): Promise<{ success: boolean; error?: string; count?: number }> {
  const structure = await getPackStructure(projectId, packId);
  if (structure.entries.length === 0) {
    return { success: false, error: "No samples to export" };
  }

  const zip = new JSZip();
  let written = 0;

  for (const entry of structure.entries) {
    const blob = await resolvePathToBlob(entry.sourceRef, "source");
    if (!blob) continue;

    const { mainBlob } = await exportAudioWithEdits(blob, {
      regionStart: entry.regionStart,
      regionEnd: entry.regionEnd,
    });

    const safeName = sanitizeFilenameMinimal(entry.displayName) || "sample";
    const ext = safeName.includes(".") ? "" : ".wav";
    const folderPath = buildFolderPathForEntry(entry, structure.folders);
    const zipPath = folderPath.length > 0 ? [...folderPath, safeName + ext].join("/") : safeName + ext;
    zip.file(zipPath, mainBlob);
    written += 1;
  }

  if (written === 0) {
    return { success: false, error: "Could not resolve any samples" };
  }

  const packJson = { name: packName };
  zip.file("pack.json", JSON.stringify(packJson, null, 2));

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(zipBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilenameMinimal(packName) || "pack"}.zip`;
  a.click();
  URL.revokeObjectURL(url);

  return { success: true, count: written };
}
