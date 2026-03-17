/**
 * Sync project to/from Liveblocks room storage.
 */
import type { Room } from "@liveblocks/client";
import type { ProjectDocument } from "./project-document";
import { normalizeProjectDocument } from "./project-document";

export async function getProjectJsonFromRoom(room: Room): Promise<string | null> {
  const { root } = await room.getStorage();
  const projectJson = root.get("projectJson");
  return typeof projectJson === "string" ? projectJson : null;
}

export async function loadProjectFromRoom(room: Room): Promise<ProjectDocument | null> {
  const projectJson = await getProjectJsonFromRoom(room);
  if (!projectJson) return null;
  try {
    const parsed = JSON.parse(projectJson) as Record<string, unknown>;
    return normalizeProjectDocument(parsed);
  } catch {
    return null;
  }
}

let lastSaveToRoomAt = 0;
let lastSavedProjectJson: string | null = null;

export function shouldIgnoreStorageUpdate(ignoreWindowMs = 800): boolean {
  return Date.now() - lastSaveToRoomAt < ignoreWindowMs;
}

/** Check if storage update is from our own save (by content) - use after loading from room. */
export function isOurSavedProject(loadedJson: string): boolean {
  return lastSavedProjectJson !== null && lastSavedProjectJson === loadedJson;
}

export async function saveProjectToRoom(room: Room, project: ProjectDocument): Promise<void> {
  const { root } = await room.getStorage();
  const projectJson = JSON.stringify(project);
  lastSaveToRoomAt = Date.now();
  lastSavedProjectJson = projectJson;
  root.set("projectJson", projectJson);
}
