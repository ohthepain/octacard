/**
 * Get or create a pack for project uploads (when in room, local files must be uploaded).
 * Caches pack ID in localStorage.
 */
import { createPack } from "./remote-library";

const STORAGE_KEY = "octacard_project_upload_pack_id";

let cachedPackId: string | null = null;

function loadCachedPackId(): string | null {
  if (cachedPackId) return cachedPackId;
  try {
    cachedPackId = localStorage.getItem(STORAGE_KEY);
    return cachedPackId;
  } catch {
    return null;
  }
}

function savePackId(id: string): void {
  cachedPackId = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // ignore
  }
}

/**
 * Get or create the project upload pack. Returns null if user is not authenticated.
 */
export async function getOrCreateProjectPackId(): Promise<string | null> {
  const existing = loadCachedPackId();
  if (existing) return existing;

  try {
    const pack = await createPack({
      name: "Project Uploads",
      isPublic: false,
    });
    savePackId(pack.id);
    return pack.id;
  } catch {
    return null;
  }
}
