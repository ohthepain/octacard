/**
 * Project persistence: API when authenticated.
 * No IndexedDB; unauthenticated users get in-memory projects (synced to Liveblocks when configured).
 */
import { apiFetch } from "./api-client";
import { getSession } from "./auth-client";
import type { ProjectDocument } from "./project-document";
import { normalizeProjectDocument } from "./project-document";
import { SLOT_ROW_SIZE } from "@/stores/project-store";
import type { FormatSettings } from "@/stores/format-preset-store";

const API_BASE = "/api/projects";

async function hasSession(): Promise<boolean> {
  const { data } = await getSession();
  return Boolean(data?.user);
}

function createProjectInMemory(name: string, formatSettings?: FormatSettings | null): ProjectDocument {
  const now = Date.now();
  const stackId = crypto.randomUUID();
  return {
    id: crypto.randomUUID(),
    name,
    coverImageS3Key: null,
    coverImageUrl: null,
    createdAt: now,
    updatedAt: now,
    isPublic: false,
    activeStackId: stackId,
    stacks: [
      {
        id: stackId,
        name: "Stack 1",
        sortOrder: 0,
        slots: Array.from({ length: SLOT_ROW_SIZE }, () => null),
        activeSlotIndex: 0,
        previewMode: "single",
        bpmAuto: true,
        globalTempoBpm: 120,
      },
    ],
    sampleEdits: {},
    formatSettings: formatSettings ?? undefined,
  };
}

/** Get project from API /me when authenticated; 404 = no project. Returns null when not authenticated. */
export async function getProject(_id?: string): Promise<ProjectDocument | null> {
  if (!(await hasSession())) return null;
  const res = await apiFetch(`${API_BASE}/me`);
  if (res.ok) {
    const text = await res.text();
    if (!text || text.trim() === "") return null;
    try {
      const data = JSON.parse(text) as Record<string, unknown>;
      return normalizeProjectDocument(data);
    } catch {
      return null;
    }
  }
  if (res.status === 404) return null;
  if (res.status === 401) return null;
  return null;
}

/** Create new project with fresh state. Resets stack, cover, timeSignature, transportDefaults, arrangementMetadata. Preserves formatSettings. */
export async function createNewProject(
  name: string,
  formatSettings: FormatSettings | Record<string, unknown> | null,
): Promise<ProjectDocument> {
  const res = await apiFetch(`${API_BASE}/new`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, formatSettings }),
  });
  if (res.status === 401) {
    return createProjectInMemory(name, formatSettings as unknown as FormatSettings | undefined);
  }
  if (!res.ok) {
    throw new Error(`Failed to create new project: ${res.status}`);
  }
  const text = await res.text();
  if (!text || text.trim() === "") {
    // Server returned 200 with empty body - often means request didn't reach API (e.g. wrong port, proxy issue).
    // Fall back to in-memory project so the UI at least updates.
    return createProjectInMemory(name, formatSettings as unknown as FormatSettings | undefined);
  }
  try {
    const data = JSON.parse(text) as Record<string, unknown>;
    return normalizeProjectDocument(data);
  } catch {
    throw new Error(`Invalid JSON in response: ${text.slice(0, 100)}`);
  }
}

/** Create project: API when authenticated, in-memory when not. */
export async function createProject(name: string): Promise<ProjectDocument> {
  const res = await apiFetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (res.ok) {
    const data = await res.json();
    return normalizeProjectDocument(data as Record<string, unknown>);
  }
  if (res.status === 401) {
    return createProjectInMemory(name);
  }
  throw new Error(`Failed to create project: ${res.status}`);
}

/** Save project: API when authenticated. No-op when not (in-memory projects sync to Liveblocks only). */
export async function saveProject(project: ProjectDocument): Promise<void> {
  if (!(await hasSession())) return;
  const res = await apiFetch(`${API_BASE}/${project.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: project.name,
      coverImageS3Key: project.coverImageS3Key ?? null,
      coverImageUrl: project.coverImageUrl ?? null,
      isPublic: project.isPublic,
      activeStackId: project.activeStackId,
      stacks: project.stacks,
      sampleEdits: project.sampleEdits,
      timeSignature: project.timeSignature as { num: number; denom: number } | null,
      transportDefaults: project.transportDefaults as { volume: number; muted: boolean } | null,
      arrangementMetadata: project.arrangementMetadata,
      formatSettings: (project.formatSettings ?? null) as unknown as Record<string, unknown> | null,
    }),
  });
  if (res.ok) return;
  if (res.status === 401) return;
  throw new Error(`Failed to save project: ${res.status}`);
}

/** Check if user can persist to DB (authenticated) */
export async function canPersistToDb(): Promise<boolean> {
  return hasSession();
}

/** Get presigned upload URL for project cover (authenticated only) */
export async function getProjectCoverUploadUrl(
  projectId: string,
  contentType: string,
): Promise<{ key: string; uploadUrl: string; expiresIn: number }> {
  const res = await apiFetch(`${API_BASE}/${projectId}/cover-upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType }),
  });
  if (!res.ok) {
    throw new Error(`Failed to get project cover upload URL (${res.status})`);
  }
  return res.json();
}
