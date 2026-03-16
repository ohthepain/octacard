/**
 * Current project context: orchestrates load/save, syncs with project, sample-edits, format-preset stores.
 */
import { create } from "zustand";
import type { ProjectDocument } from "@/lib/project-document";
import { getProject, createProject, saveProject } from "@/lib/project-persistence";
import { useProjectStore } from "./project-store";
import { useSampleEditsStore } from "./sample-edits-store";
import { useFormatPresetStore } from "./format-preset-store";
import { useRoomStore } from "./room-store";
import { hasLiveblocksConfig } from "@/lib/liveblocks-client";
import { loadProjectFromRoom, saveProjectToRoom } from "@/lib/liveblocks-project-sync";

interface CurrentProjectState {
  isHydrating: boolean;
  loadProject: () => Promise<boolean>;
  createAndLoadProject: (name: string) => Promise<ProjectDocument | null>;
  persistToProject: () => Promise<void>;
  setProjectName: (name: string) => void;
  clearProject: () => void;
  loadProjectFromRoomStorage: () => Promise<boolean>;
  /** Create new project: new id, reset content. Preserves Liveblocks room. */
  createNewProject: (name: string) => Promise<ProjectDocument | null>;
  /** Build project document from current stores (for export, etc.) */
  getProjectDocument: () => ProjectDocument | null;
  /** Persist current project to IndexedDB/API (e.g. before leaving room). */
  persistToBackend: () => Promise<void>;
}

export const useCurrentProjectStore = create<CurrentProjectState>((set, get) => ({
  isHydrating: false,

  loadProject: async () => {
    const project = await getProject();
    if (!project) return false;

    await get().persistToProject();
    useRoomStore.getState().leaveRoom();

    set({ isHydrating: true });
    try {
      useProjectStore.getState().setMetadata({
        id: project.id,
        name: project.name,
        coverImageS3Key: project.coverImageS3Key ?? null,
        coverImageUrl: project.coverImageUrl ?? null,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        isPublic: project.isPublic,
      });
      useProjectStore.getState().hydrateFromProject({
        stacks: project.stacks,
        activeStackId: project.activeStackId,
      });
      useSampleEditsStore.getState().hydrateFromProject(project.sampleEdits);
      useFormatPresetStore.getState().hydrateFromProject(project.formatSettings);
      if (hasLiveblocksConfig()) {
        await useRoomStore.getState().ensureProjectRoom(project.id, project);
        await get().persistToProject();
      }
      return true;
    } finally {
      set({ isHydrating: false });
    }
  },

  createAndLoadProject: async (name: string) => {
    const project = await createProject(name);
    set({ isHydrating: true });
    try {
      useProjectStore.getState().setMetadata({
        id: project.id,
        name: project.name,
        coverImageS3Key: project.coverImageS3Key ?? null,
        coverImageUrl: project.coverImageUrl ?? null,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        isPublic: project.isPublic,
      });
      useProjectStore.getState().hydrateFromProject({
        stacks: project.stacks,
        activeStackId: project.activeStackId,
      });
      useSampleEditsStore.getState().hydrateFromProject(project.sampleEdits);
      useFormatPresetStore.getState().hydrateFromProject(project.formatSettings);
      if (hasLiveblocksConfig()) {
        await useRoomStore.getState().ensureProjectRoom(project.id, project);
        await get().persistToProject();
      }
      return project;
    } finally {
      set({ isHydrating: false });
    }
  },

  createNewProject: async (name: string) => {
    await get().persistToProject();
    useRoomStore.getState().leaveRoom();

    const project = await createProject(name);
    set({ isHydrating: true });
    try {
      useProjectStore.getState().setMetadata({
        id: project.id,
        name: project.name,
        coverImageS3Key: project.coverImageS3Key ?? null,
        coverImageUrl: project.coverImageUrl ?? null,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        isPublic: project.isPublic,
      });
      useProjectStore.getState().hydrateFromProject({
        stacks: project.stacks,
        activeStackId: project.activeStackId,
      });
      useSampleEditsStore.getState().hydrateFromProject(project.sampleEdits);
      useFormatPresetStore.getState().hydrateFromProject(project.formatSettings);
      if (hasLiveblocksConfig()) {
        await useRoomStore.getState().ensureProjectRoom(project.id, project);
        await get().persistToProject();
      }
      return project;
    } finally {
      set({ isHydrating: false });
    }
  },

  persistToProject: async () => {
    const { isHydrating } = get();
    if (isHydrating) return;

    const projectState = useProjectStore.getState();
    if (!projectState.id) return;

    const editsState = useSampleEditsStore.getState();
    const formatState = useFormatPresetStore.getState();

    const sampleEdits: Record<string, import("@/stores/sample-edits-store").SampleEdits> = {};
    editsState.editsByPath.forEach((v, k) => {
      sampleEdits[k] = v;
    });

    const doc: ProjectDocument = {
      id: projectState.id,
      name: projectState.name,
      coverImageS3Key: projectState.coverImageS3Key ?? undefined,
      coverImageUrl: projectState.coverImageUrl ?? undefined,
      createdAt: projectState.createdAt,
      updatedAt: Date.now(),
      isPublic: projectState.isPublic,
      activeStackId: projectState.activeStackId,
      stacks: projectState.stacks,
      sampleEdits,
      formatSettings: formatState.currentPreset.settings,
    };

    const { room } = useRoomStore.getState();
    if (room) {
      await saveProjectToRoom(room, doc);
    } else {
      await saveProject(doc);
    }
    // Don't call setMetadata here - it would trigger useProjectSync and cause an infinite persist loop
  },

  loadProjectFromRoomStorage: async () => {
    const { room, roomId } = useRoomStore.getState();
    if (!room || !roomId) return false;

    const project = await loadProjectFromRoom(room);
    if (!project) return false;

    set({ isHydrating: true });
    try {
      useProjectStore.getState().setMetadata({
        id: project.id,
        name: project.name,
        coverImageS3Key: project.coverImageS3Key ?? null,
        coverImageUrl: project.coverImageUrl ?? null,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        isPublic: project.isPublic,
      });
      useProjectStore.getState().hydrateFromProject({
        stacks: project.stacks,
        activeStackId: project.activeStackId,
      });
      useSampleEditsStore.getState().hydrateFromProject(project.sampleEdits);
      useFormatPresetStore.getState().hydrateFromProject(project.formatSettings);
      return true;
    } finally {
      set({ isHydrating: false });
    }
  },

  setProjectName: (name: string) => {
    useProjectStore.getState().setName(name);
  },

  clearProject: () => {
    void get().persistToProject().then(() => {
      useRoomStore.getState().leaveRoom();
      useProjectStore.getState().clear();
    });
  },

  persistToBackend: async () => {
    const doc = get().getProjectDocument();
    if (doc) await saveProject(doc);
  },

  getProjectDocument: () => {
    const projectState = useProjectStore.getState();
    if (!projectState.id) return null;
    const editsState = useSampleEditsStore.getState();
    const formatState = useFormatPresetStore.getState();
    const sampleEdits: Record<string, import("@/stores/sample-edits-store").SampleEdits> = {};
    editsState.editsByPath.forEach((v, k) => {
      sampleEdits[k] = v;
    });
    return {
      id: projectState.id,
      name: projectState.name,
      coverImageS3Key: projectState.coverImageS3Key ?? undefined,
      coverImageUrl: projectState.coverImageUrl ?? undefined,
      createdAt: projectState.createdAt,
      updatedAt: Date.now(),
      isPublic: projectState.isPublic,
      activeStackId: projectState.activeStackId,
      stacks: projectState.stacks,
      sampleEdits,
      formatSettings: formatState.currentPreset.settings,
    };
  },
}));
