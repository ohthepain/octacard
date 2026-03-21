import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface ProjectPackRef {
  id: string;
  name: string;
  /** Pack cover image URL for display in lists (optional, fetched when missing) */
  coverImageProxyUrl?: string | null;
}

interface ProjectColumnProjectState {
  projectPacks: ProjectPackRef[];
  globalPacks: ProjectPackRef[];
}

interface ProjectColumnState {
  byProjectId: Record<string, ProjectColumnProjectState>;
  addProjectPack: (projectId: string, pack: ProjectPackRef) => void;
  removeProjectPack: (projectId: string, packId: string) => void;
  addGlobalPack: (projectId: string, pack: ProjectPackRef) => void;
  removeGlobalPack: (projectId: string, packId: string) => void;
}

const EMPTY_PROJECT_STATE: ProjectColumnProjectState = {
  projectPacks: [],
  globalPacks: [],
};

function upsertPack(list: ProjectPackRef[], pack: ProjectPackRef): ProjectPackRef[] {
  const existingIndex = list.findIndex((entry) => entry.id === pack.id);
  if (existingIndex < 0) {
    return [...list, pack];
  }
  const next = [...list];
  next[existingIndex] = pack;
  return next;
}

function removePack(list: ProjectPackRef[], packId: string): ProjectPackRef[] {
  return list.filter((entry) => entry.id !== packId);
}

export const useProjectColumnStore = create<ProjectColumnState>()(
  persist(
    (set) => ({
      byProjectId: {},

      addProjectPack: (projectId, pack) => {
        if (!projectId) return;
        set((state) => {
          const current = state.byProjectId[projectId] ?? EMPTY_PROJECT_STATE;
          return {
            byProjectId: {
              ...state.byProjectId,
              [projectId]: {
                ...current,
                projectPacks: upsertPack(current.projectPacks, pack),
              },
            },
          };
        });
      },

      removeProjectPack: (projectId, packId) => {
        if (!projectId) return;
        set((state) => {
          const current = state.byProjectId[projectId] ?? EMPTY_PROJECT_STATE;
          return {
            byProjectId: {
              ...state.byProjectId,
              [projectId]: {
                ...current,
                projectPacks: removePack(current.projectPacks, packId),
              },
            },
          };
        });
      },

      addGlobalPack: (projectId, pack) => {
        if (!projectId) return;
        set((state) => {
          const current = state.byProjectId[projectId] ?? EMPTY_PROJECT_STATE;
          return {
            byProjectId: {
              ...state.byProjectId,
              [projectId]: {
                ...current,
                globalPacks: upsertPack(current.globalPacks, pack),
              },
            },
          };
        });
      },

      removeGlobalPack: (projectId, packId) => {
        if (!projectId) return;
        set((state) => {
          const current = state.byProjectId[projectId] ?? EMPTY_PROJECT_STATE;
          return {
            byProjectId: {
              ...state.byProjectId,
              [projectId]: {
                ...current,
                globalPacks: removePack(current.globalPacks, packId),
              },
            },
          };
        });
      },
    }),
    {
      name: "project-column-store",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

export function useProjectColumn(projectId: string | null) {
  const projectState = useProjectColumnStore((state) => {
    if (!projectId) return EMPTY_PROJECT_STATE;
    return state.byProjectId[projectId] ?? EMPTY_PROJECT_STATE;
  });

  return {
    projectPacks: projectState.projectPacks,
    globalPacks: projectState.globalPacks,
    addProjectPack: (pack: ProjectPackRef) => {
      if (!projectId) return;
      useProjectColumnStore.getState().addProjectPack(projectId, pack);
    },
    removeProjectPack: (packId: string) => {
      if (!projectId) return;
      useProjectColumnStore.getState().removeProjectPack(projectId, packId);
    },
    addGlobalPack: (pack: ProjectPackRef) => {
      if (!projectId) return;
      useProjectColumnStore.getState().addGlobalPack(projectId, pack);
    },
    removeGlobalPack: (packId: string) => {
      if (!projectId) return;
      useProjectColumnStore.getState().removeGlobalPack(projectId, packId);
    },
  };
}
