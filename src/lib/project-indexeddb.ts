/**
 * Project storage in IndexedDB for unauthenticated users.
 * Local-only; no sync to DB.
 */
import { createStore, get, set, del, keys } from "idb-keyval";
import type { ProjectDocument } from "./project-document";
import { SLOT_ROW_SIZE } from "@/stores/project-store";

const DB_NAME = "octacard-projects";
const STORE_NAME = "projects";
const META_LAST_OPENED = "__meta__lastOpened";
const META_PROJECT_ORDER = "__meta__projectOrder";

const store = createStore(DB_NAME, STORE_NAME);

const DEFAULT_BPM = 120;

function createEmptyProject(name: string): ProjectDocument {
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
        globalTempoBpm: DEFAULT_BPM,
      },
    ],
    sampleEdits: {},
  };
}

function isMetaKey(key: string): boolean {
  return key.startsWith("__meta__");
}

export async function createProject(name: string): Promise<ProjectDocument> {
  const project = createEmptyProject(name);
  await set(project.id, project, store);
  await appendToProjectOrder(project.id);
  return project;
}

export async function getProject(id: string): Promise<ProjectDocument | null> {
  const project = await get<ProjectDocument>(id, store);
  return project ?? null;
}

export async function saveProject(project: ProjectDocument): Promise<void> {
  const updated = { ...project, updatedAt: Date.now() };
  await set(project.id, updated, store);
}

export async function getLastOpenedProjectId(): Promise<string | null> {
  const id = await get<string>(META_LAST_OPENED, store);
  return id ?? null;
}

export async function setLastOpenedProjectId(id: string | null): Promise<void> {
  if (id) {
    await set(META_LAST_OPENED, id, store);
    await appendToProjectOrder(id);
  } else {
    await del(META_LAST_OPENED, store);
  }
}

export async function listProjectIds(): Promise<string[]> {
  const allKeys = await keys(store);
  const projectIds = (allKeys as string[]).filter((k) => !isMetaKey(k));
  return projectIds;
}

async function getProjectOrder(): Promise<string[]> {
  const order = await get<string[]>(META_PROJECT_ORDER, store);
  return order ?? [];
}

async function appendToProjectOrder(id: string): Promise<void> {
  const order = await getProjectOrder();
  const filtered = order.filter((x) => x !== id);
  filtered.unshift(id);
  await set(META_PROJECT_ORDER, filtered.slice(0, 100), store);
}
