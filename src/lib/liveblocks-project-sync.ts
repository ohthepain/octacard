/**
 * Sync project to/from Liveblocks room storage.
 */
import type { Room } from "@liveblocks/client";
import type { ProjectDocument } from "./project-document";
import { normalizeProjectDocument } from "./project-document";

export async function loadProjectFromRoom(room: Room): Promise<ProjectDocument | null> {
  const { root } = await room.getStorage();
  const projectJson = root.get("projectJson");
  if (typeof projectJson !== "string") return null;
  try {
    const parsed = JSON.parse(projectJson) as Record<string, unknown>;
    return normalizeProjectDocument(parsed);
  } catch {
    return null;
  }
}

let lastSaveToRoomAt = 0;

export function shouldIgnoreStorageUpdate(ignoreWindowMs = 300): boolean {
  return Date.now() - lastSaveToRoomAt < ignoreWindowMs;
}

export async function saveProjectToRoom(room: Room, project: ProjectDocument): Promise<void> {
  const { root } = await room.getStorage();
  root.set("projectJson", JSON.stringify(project));
  lastSaveToRoomAt = Date.now();
}
