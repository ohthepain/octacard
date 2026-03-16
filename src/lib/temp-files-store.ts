/**
 * IndexedDB-backed store for Temp Files (non-Chromium platforms).
 * No eviction—files persist until user deletes.
 */
import { createStore, get, set, del, keys } from "idb-keyval";
import { sanitizeFilenameMinimal } from "./filename";

const DB_NAME = "octacard-temp-files";
const STORE_NAME = "files";
const TOTAL_KEY = "__total__";
const ROOT = "/Temp Files";

const store = createStore(DB_NAME, STORE_NAME);

export const TEMP_FILES_ROOT = ROOT;
export const TEMP_PATH_PREFIX = "temp://";

interface StoredEntry {
  blob: Blob;
  fileName: string;
  sizeBytes: number;
  createdAt: number;
}

function normalizePath(path: string): string {
  const p = path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "").trim();
  return p ? `/${p}` : "/";
}

function toStoreKey(virtualPath: string): string {
  const normalized = normalizePath(virtualPath);
  return normalized.startsWith(ROOT) ? normalized : `${ROOT}${normalized === "/" ? "" : normalized}`;
}

function fromStoreKey(storeKey: string): string {
  return storeKey.startsWith(ROOT) ? storeKey : `${ROOT}/${storeKey}`;
}

async function getTotalBytes(): Promise<number> {
  const n = await get<number>(TOTAL_KEY, store);
  return n ?? 0;
}

async function setTotalBytes(n: number): Promise<void> {
  await set(TOTAL_KEY, n, store);
}

/**
 * Check if a path is a temp path (temp:///...).
 */
export function isTempPath(path: string): boolean {
  return path.startsWith(TEMP_PATH_PREFIX);
}

/**
 * Convert virtual path to temp path scheme.
 */
export function toTempPath(virtualPath: string): string {
  const key = toStoreKey(virtualPath);
  return `${TEMP_PATH_PREFIX}${key}`;
}

/**
 * Extract virtual path from temp path scheme.
 */
export function fromTempPath(tempPath: string): string | null {
  if (!tempPath.startsWith(TEMP_PATH_PREFIX)) return null;
  return tempPath.slice(TEMP_PATH_PREFIX.length) || ROOT;
}

/**
 * Store a file. Overwrites if exists.
 */
export async function putFile(
  virtualPath: string,
  blob: Blob,
  fileName?: string,
): Promise<void> {
  const key = toStoreKey(virtualPath);
  const name = fileName ?? key.split("/").filter(Boolean).pop() ?? "file";
  const safeName = sanitizeFilenameMinimal(name) || "file";
  const sizeBytes = blob.size;
  const createdAt = Date.now();

  const existing = await get<StoredEntry>(key, store);
  const prevSize = existing?.sizeBytes ?? 0;

  await set(key, { blob, fileName: safeName, sizeBytes, createdAt }, store);
  const total = await getTotalBytes();
  await setTotalBytes(total - prevSize + sizeBytes);
}

/**
 * Get a file blob. Returns null if not found.
 */
export async function getFile(virtualPath: string): Promise<Blob | null> {
  const key = toStoreKey(virtualPath);
  const entry = await get<StoredEntry>(key, store);
  return entry?.blob ?? null;
}

/**
 * Get file metadata (for display).
 */
export async function getFileMeta(
  virtualPath: string,
): Promise<{ fileName: string; sizeBytes: number; createdAt: number } | null> {
  const key = toStoreKey(virtualPath);
  const entry = await get<StoredEntry>(key, store);
  if (!entry) return null;
  return {
    fileName: entry.fileName,
    sizeBytes: entry.sizeBytes,
    createdAt: entry.createdAt,
  };
}

export interface ListDirectoryResult {
  files: Array<{ name: string; path: string; size: number }>;
  folders: Array<{ name: string; path: string }>;
}

/**
 * List direct children of a directory.
 */
export async function listDirectory(virtualPath: string): Promise<ListDirectoryResult> {
  const dirKey = toStoreKey(virtualPath);
  const dirPrefix = dirKey === "/" ? ROOT : dirKey.endsWith("/") ? dirKey : `${dirKey}/`;
  const dirPrefixLen = dirPrefix.length;

  const allKeys = await keys(store);
  const fileKeys = allKeys.filter((k) => typeof k === "string" && k !== TOTAL_KEY) as string[];

  const files: Array<{ name: string; path: string; size: number }> = [];
  const folderMap = new Map<string, string>();

  for (const k of fileKeys) {
    if (!k.startsWith(dirPrefix) || k === dirPrefix) continue;
    const rest = k.slice(dirPrefixLen);
    const parts = rest.split("/").filter(Boolean);
    if (parts.length === 1) {
      const entry = await get<StoredEntry>(k, store);
      if (entry) {
        const vp = fromStoreKey(k);
        files.push({
          name: entry.fileName,
          path: toTempPath(vp),
          size: entry.sizeBytes,
        });
      }
    } else if (parts.length > 1) {
      const folderName = parts[0]!;
      const folderPath = dirKey.endsWith("/") ? `${dirKey}${folderName}` : `${dirKey}/${folderName}`;
      folderMap.set(folderName, toTempPath(folderPath));
    }
  }

  const folders = Array.from(folderMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, path]) => ({ name, path }));

  return { files, folders };
}

/**
 * Delete a file.
 */
export async function deleteFile(virtualPath: string): Promise<boolean> {
  const key = toStoreKey(virtualPath);
  const entry = await get<StoredEntry>(key, store);
  if (!entry) return false;
  await del(key, store);
  const total = await getTotalBytes();
  await setTotalBytes(total - entry.sizeBytes);
  return true;
}

/**
 * Delete a folder and all files under it.
 */
export async function deleteFolder(virtualPath: string): Promise<number> {
  const dirKey = toStoreKey(virtualPath);
  const dirPrefix = dirKey === "/" ? ROOT : dirKey.endsWith("/") ? dirKey : `${dirKey}/`;

  const allKeys = await keys(store);
  const toDelete = (allKeys.filter((k) => typeof k === "string" && k !== TOTAL_KEY) as string[]).filter(
    (k) => k.startsWith(dirPrefix),
  );

  let freed = 0;
  for (const k of toDelete) {
    const entry = await get<StoredEntry>(k, store);
    if (entry) {
      freed += entry.sizeBytes;
      await del(k, store);
    }
  }

  const total = await getTotalBytes();
  await setTotalBytes(total - freed);
  return freed;
}

/**
 * Create folder is a no-op; folders are implied by path prefixes.
 */
export function createFolder(_virtualPath: string): void {
  // No-op
}

/**
 * Get total bytes used by Temp Files (for size bar).
 */
export async function getTotalBytesUsed(): Promise<number> {
  return getTotalBytes();
}

/**
 * List all file paths under a directory (recursive). For pack download.
 */
export async function listAllFilesUnder(virtualPath: string): Promise<Array<{ path: string; fileName: string }>> {
  const dirKey = toStoreKey(virtualPath);
  const dirPrefix = dirKey === "/" ? ROOT : dirKey.endsWith("/") ? dirKey : `${dirKey}/`;

  const allKeys = await keys(store);
  const fileKeys = (allKeys.filter((k) => typeof k === "string" && k !== TOTAL_KEY) as string[]).filter((k) =>
    k.startsWith(dirPrefix),
  );

  const result: Array<{ path: string; fileName: string }> = [];
  for (const k of fileKeys) {
    const entry = await get<StoredEntry>(k, store);
    if (entry) {
      const vp = fromStoreKey(k);
      result.push({ path: toTempPath(vp), fileName: entry.fileName });
    }
  }
  return result;
}
