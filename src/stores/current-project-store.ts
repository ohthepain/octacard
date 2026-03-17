/**
 * Current project context: orchestrates load/save, syncs with project, sample-edits, format-preset stores.
 */
import { create } from "zustand";
import type { ProjectDocument } from "@/lib/project-document";
import {
  getProject,
  createProject,
  createNewProject as createNewProjectFromApi,
  saveProject,
} from "@/lib/project-persistence";
import { useProjectStore, setSkipHistoryForHydrate } from "./project-store";
import { useSampleEditsStore } from "./sample-edits-store";
import { useFormatPresetStore } from "./format-preset-store";
import { useRoomStore } from "./room-store";
import {
  loadProjectFromRoom,
  saveProjectToRoom,
  getProjectJsonFromRoom,
  isOurSavedProject,
} from "@/lib/liveblocks-project-sync";

interface CurrentProjectState {
  isHydrating: boolean;
  loadProject: () => Promise<boolean>;
  createAndLoadProject: (name: string) => Promise<ProjectDocument | null>;
  persistToProject: () => Promise<void>;
  setProjectName: (name: string) => void;
  clearProject: () => void;
  loadProjectFromRoomStorage: () => Promise<boolean>;
  /** Create new project: new id, reset content. Preserves formatSettings from current or passed value. */
  createNewProject: (name: string, formatSettings?: Record<string, unknown> | null) => Promise<ProjectDocument | null>;
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
      // Room is joined only when user explicitly goes live via Live toggle
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
      // Room is joined only when user explicitly goes live via Live toggle
      return project;
    } finally {
      set({ isHydrating: false });
    }
  },

  createNewProject: async (name: string, formatSettings?: Record<string, unknown> | null) => {
    await get().persistToProject();
    useRoomStore.getState().leaveRoom();

    const formatState = useFormatPresetStore.getState();
    const settingsToPreserve = formatSettings ?? formatState.currentPreset.settings;
    const project = await createNewProjectFromApi(name, settingsToPreserve);
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
      // Room is joined only when user explicitly goes live via Live toggle
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
    }
    // Always persist to API when authenticated (survives refresh, room leave)
    await saveProject(doc);
    // Don't call setMetadata here - it would trigger useProjectSync and cause an infinite persist loop
  },

  loadProjectFromRoomStorage: async () => {
    const { room, roomId } = useRoomStore.getState();
    if (!room || !roomId) return false;

    const projectJson = await getProjectJsonFromRoom(room);
    if (!projectJson) return false;
    if (isOurSavedProject(projectJson)) {
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/d8c1211a-61cd-47fc-bb94-a43ef555084b',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'ec0b9e'},body:JSON.stringify({sessionId:'ec0b9e',location:'current-project-store.ts:loadProjectFromRoomStorage',message:'skipped hydrate (our save)',data:{},timestamp:Date.now(),hypothesisId:'D'})}).catch(()=>{});
      // #endregion
      return false;
    }

    const project = await loadProjectFromRoom(room);
    if (!project) return false;

    // Don't overwrite name while user is editing it (avoids room sync stomping on typing)
    const nameInputFocused = document.activeElement?.id === "project-name";
    const nameToUse = nameInputFocused ? useProjectStore.getState().name : project.name;

    set({ isHydrating: true });
    setSkipHistoryForHydrate(true);
    try {
      useProjectStore.getState().setMetadata({
        id: project.id,
        name: nameToUse,
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
      // Don't clear undo history: user should be able to undo state we've sent to Liveblocks
      return true;
    } finally {
      setSkipHistoryForHydrate(false);
      set({ isHydrating: false });
    }
  },

  setProjectName: (name: string) => {
    useProjectStore.getState().setName(name);
  },

  clearProject: () => {
    void get()
      .persistToProject()
      .then(() => {
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
