/**
 * LRU cache for auditioning global pack samples.
 * Samples are stored in IndexedDB and evicted when over max size (50MB).
 */
import { createStore, get, set, del, keys } from "idb-keyval";
import { downloadRemoteSampleBlob } from "./remote-library";

const DB_NAME = "octacard-audition-cache";
const STORE_NAME = "samples";
const LRU_KEY = "__lru__";
const TOTAL_KEY = "__total__";
const MAX_BYTES = 50 * 1024 * 1024; // 50MB

const store = createStore(DB_NAME, STORE_NAME);

interface CachedEntry {
  blob: Blob;
  sizeBytes: number;
  createdAt?: number;
  lastAccessed?: number;
}

export interface CacheEntryInfo {
  sampleId: string;
  sizeBytes: number;
  contentType: string;
  createdAt?: number;
  lastAccessed?: number;
}

const objectUrls = new Map<string, string>();

async function getLruList(): Promise<string[]> {
  const list = await get<string[]>(LRU_KEY, store);
  return list ?? [];
}

async function setLruList(list: string[]): Promise<void> {
  await set(LRU_KEY, list, store);
}

async function getTotalBytes(): Promise<number> {
  const n = await get<number>(TOTAL_KEY, store);
  return n ?? 0;
}

async function setTotalBytes(n: number): Promise<void> {
  await set(TOTAL_KEY, n, store);
}

async function evictUntilUnderLimit(excludeSampleId?: string): Promise<void> {
  let total = await getTotalBytes();
  const lru = await getLruList();

  while (total > MAX_BYTES && lru.length > 0) {
    const oldestId = lru[0]!;
    if (oldestId === excludeSampleId) break;
    lru.shift();
    const entry = await get<CachedEntry>(oldestId, store);
    if (entry) {
      await del(oldestId, store);
      total -= entry.sizeBytes;
      const url = objectUrls.get(oldestId);
      if (url) {
        URL.revokeObjectURL(url);
        objectUrls.delete(oldestId);
      }
    }
    await setLruList(lru);
    await setTotalBytes(total);
  }
}

/**
 * Get or fetch a remote sample. Returns blob and object URL.
 * Uses LRU cache; evicts when over 50MB.
 */
export async function getOrFetchRemoteSample(
  sampleId: string,
  _fileName: string,
): Promise<{ blob: Blob; objectUrl: string }> {
  const cached = await get<CachedEntry>(sampleId, store);
  if (cached) {
    // Update LRU: move to end
    const lru = await getLruList();
    const idx = lru.indexOf(sampleId);
    if (idx >= 0) lru.splice(idx, 1);
    lru.push(sampleId);
    await setLruList(lru);

    const existingUrl = objectUrls.get(sampleId);
    if (existingUrl) {
      return { blob: cached.blob, objectUrl: existingUrl };
    }
    const url = URL.createObjectURL(cached.blob);
    objectUrls.set(sampleId, url);
    return { blob: cached.blob, objectUrl: url };
  }

  const blob = await downloadRemoteSampleBlob(sampleId);
  const sizeBytes = blob.size;
  const now = Date.now();

  await set(sampleId, { blob, sizeBytes, createdAt: now, lastAccessed: now }, store);
  const lru = await getLruList();
  lru.push(sampleId);
  await setLruList(lru);
  const total = await getTotalBytes();
  await setTotalBytes(total + sizeBytes);

  await evictUntilUnderLimit(sampleId);

  const url = URL.createObjectURL(blob);
  objectUrls.set(sampleId, url);
  return { blob, objectUrl: url };
}

/**
 * Peek cache for a sample. Returns blob if cached, null otherwise.
 * Used by pack-to-folder to avoid re-downloading auditioned samples.
 */
export async function getCachedBlob(sampleId: string): Promise<Blob | null> {
  const cached = await get<CachedEntry>(sampleId, store);
  return cached?.blob ?? null;
}

/**
 * Revoke an object URL when no longer needed.
 */
export function releaseObjectUrl(url: string): void {
  URL.revokeObjectURL(url);
  for (const [id, u] of objectUrls) {
    if (u === url) {
      objectUrls.delete(id);
      break;
    }
  }
}

/**
 * Evict a specific sample from the cache.
 */
export async function evictSample(sampleId: string): Promise<void> {
  const entry = await get<CachedEntry>(sampleId, store);
  if (entry) {
    await del(sampleId, store);
    const total = await getTotalBytes();
    await setTotalBytes(total - entry.sizeBytes);
    const lru = await getLruList();
    const idx = lru.indexOf(sampleId);
    if (idx >= 0) {
      lru.splice(idx, 1);
      await setLruList(lru);
    }
    const url = objectUrls.get(sampleId);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.delete(sampleId);
    }
  }
}

/**
 * List all cached entries for debug/inspection.
 */
export async function listCacheEntries(): Promise<CacheEntryInfo[]> {
  const allKeys = await keys(store);
  const sampleKeys = allKeys.filter((k) => k !== LRU_KEY && k !== TOTAL_KEY) as string[];
  const result: CacheEntryInfo[] = [];

  for (const sampleId of sampleKeys) {
    const entry = await get<CachedEntry>(sampleId, store);
    if (entry) {
      result.push({
        sampleId,
        sizeBytes: entry.sizeBytes,
        contentType: entry.blob.type || "application/octet-stream",
        createdAt: entry.createdAt,
        lastAccessed: entry.lastAccessed,
      });
    }
  }

  return result;
}

/**
 * Clear the entire audition cache.
 */
export async function evictAll(): Promise<void> {
  const allKeys = await keys(store);
  const sampleKeys = allKeys.filter((k) => k !== LRU_KEY && k !== TOTAL_KEY) as string[];
  for (const id of sampleKeys) {
    const url = objectUrls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      objectUrls.delete(id);
    }
    await del(id, store);
  }
  await set(LRU_KEY, [], store);
  await set(TOTAL_KEY, 0, store);
}
