/**
 * Project persistence: API when authenticated, IndexedDB when not.
 * Uses auth session check to avoid 401s when logged out; falls back to IndexedDB.
 */
import { apiFetch } from "./api-client";
import { getSession } from "./auth-client";
import type { ProjectDocument } from "./project-document";
import { normalizeProjectDocument } from "./project-document";
import {
  createProject as createProjectInIndexedDB,
  getProject as getProjectFromIndexedDB,
  saveProject as saveProjectToIndexedDB,
  getLastOpenedProjectId,
  listProjectIds,
  setLastOpenedProjectId,
} from "./project-indexeddb";

const API_BASE = "/api/projects";

async function hasSession(): Promise<boolean> {
  const { data } = await getSession();
  return Boolean(data?.user);
}

/** Get project: try API /me when authenticated; otherwise use IndexedDB (last opened or first); 404 = no project */
export async function getProject(id?: string): Promise<ProjectDocument | null> {
  if (!(await hasSession())) {
    return getProjectFromIndexedDBOrNull(id);
  }
  const res = await apiFetch(`${API_BASE}/me`);
  if (res.ok) {
    const data = await res.json();
    return normalizeProjectDocument(data as Record<string, unknown>);
  }
  if (res.status === 404) return null;
  if (res.status === 401) {
    return getProjectFromIndexedDBOrNull(id);
  }
  return null;
}

async function getProjectFromIndexedDBOrNull(id?: string): Promise<ProjectDocument | null> {
  let projectId = id ?? (await getLastOpenedProjectId());
  if (!projectId) {
    const ids = await listProjectIds();
    const projects = await Promise.all(ids.map((pid) => getProjectFromIndexedDB(pid)));
    const first = projects.find(Boolean);
    projectId = first?.id ?? null;
  }
  if (!projectId) return null;
  const doc = await getProjectFromIndexedDB(projectId);
  return doc ? normalizeProjectDocument(doc as Record<string, unknown>) : null;
}

/** Create project: try API POST when authenticated; otherwise create in IndexedDB */
export async function createProject(name: string): Promise<ProjectDocument> {
  if (!(await hasSession())) {
    const project = await createProjectInIndexedDB(name);
    await setLastOpenedProjectId(project.id);
    return project;
  }
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
    const project = await createProjectInIndexedDB(name);
    await setLastOpenedProjectId(project.id);
    return project;
  }
  throw new Error(`Failed to create project: ${res.status}`);
}

/** Save project: try API PUT when authenticated; otherwise save to IndexedDB directly */
export async function saveProject(project: ProjectDocument): Promise<void> {
  if (!(await hasSession())) {
    await saveProjectToIndexedDB(project);
    await setLastOpenedProjectId(project.id);
    return;
  }
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
      formatSettings: project.formatSettings as Record<string, unknown> | null,
    }),
  });
  if (res.ok) return;
  if (res.status === 401) {
    await saveProjectToIndexedDB(project);
    await setLastOpenedProjectId(project.id);
    return;
  }
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
