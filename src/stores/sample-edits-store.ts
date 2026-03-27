import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export interface EnvelopePoint {
  time: number;
  volume: number;
}

export interface RegionParams {
  start: number;
  end: number;
  /** WaveSurfer region fill (CSS color, often #RRGGBBAA). */
  color?: string;
}

/** Wave-editor named regions for this path; times in seconds (WaveSurfer). Persisted in project `sampleEdits`. */
export interface PersistedNamedRegion {
  id: string;
  name: string;
  start: number;
  end: number;
  /** WaveSurfer / CSS color (e.g. #RRGGBBAA). */
  color?: string;
  sortOrder?: number;
}

export interface SampleEdits {
  region?: RegionParams | null;
  envelopePoints?: EnvelopePoint[];
  namedRegions?: PersistedNamedRegion[];
  /** Playback loop region (start/end in seconds). Defaults to region or full duration. */
  loopStart?: number;
  loopEnd?: number;
  /** Where play starts within the loop region (seconds). */
  playStart?: number;
  /** Whether playback loops within the region. */
  loopEnabled?: boolean;
}

/** Single key form for virtual paths so FilePane + project JSON agree after load. */
export function canonicalSampleEditsPath(path: string): string {
  if (!path) return path;
  const p = path.replace(/\\/g, "/").replace(/\/+/g, "/");
  if (p.startsWith("temp://") || p.startsWith("remote://")) return p;
  const trimmed = p.replace(/\/$/, "") || "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function lookupEdits(
  map: Map<string, SampleEdits>,
  path: string,
): SampleEdits | undefined {
  if (!path) return undefined;
  const candidates = [path, canonicalSampleEditsPath(path)];
  if (!path.startsWith("temp://") && !path.startsWith("remote://")) {
    const c = canonicalSampleEditsPath(path);
    const noLead = c.replace(/^\//, "");
    if (noLead && noLead !== c) candidates.push(noLead);
  }
  for (const k of candidates) {
    const hit = map.get(k);
    if (hit) return hit;
  }
  return undefined;
}

function mapWithCanonicalKeys(
  rec: Record<string, SampleEdits>,
): Map<string, SampleEdits> {
  const m = new Map<string, SampleEdits>();
  for (const [k, v] of Object.entries(rec)) {
    m.set(canonicalSampleEditsPath(k), v);
  }
  return m;
}

interface SampleEditsState {
  /** Edits keyed by file path (virtual path) */
  editsByPath: Map<string, SampleEdits>;
  setEdits: (path: string, edits: SampleEdits) => void;
  getEdits: (path: string) => SampleEdits | undefined;
  clearEdits: (path: string) => void;
  /** Hydrate from project (e.g. when loading a project) */
  hydrateFromProject: (sampleEdits: Record<string, SampleEdits>) => void;
}

export const useSampleEditsStore = create<SampleEditsState>()(
  persist(
    (set, get) => ({
      editsByPath: new Map(),

      // Shallow-merge so callers (e.g. loop persist) cannot replace the whole SampleEdits with `{}`
      // and accidentally drop namedRegions when getEdits() was empty during a file switch race.
      setEdits: (path, edits) =>
        set((state) => {
          const key = canonicalSampleEditsPath(path);
          const next = new Map(state.editsByPath);
          const prev = next.get(key) ?? {};
          next.set(key, { ...prev, ...edits });
          return { editsByPath: next };
        }),

      getEdits: (path) => lookupEdits(get().editsByPath, path),

      clearEdits: (path) =>
        set((state) => {
          const next = new Map(state.editsByPath);
          next.delete(canonicalSampleEditsPath(path));
          next.delete(path);
          return { editsByPath: next };
        }),

      hydrateFromProject: (sampleEdits) =>
        set({
          editsByPath: mapWithCanonicalKeys(sampleEdits ?? {}),
        }),
    }),
    {
      name: "sample-edits-store",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ editsByPath: Object.fromEntries(state.editsByPath) }),
      merge: (persisted, current) => {
        const persistedRec =
          persisted && typeof persisted === "object" && "editsByPath" in persisted
            ? (persisted as { editsByPath?: Record<string, SampleEdits> }).editsByPath ?? {}
            : {};
        return {
          ...current,
          editsByPath:
            persisted && typeof persisted === "object" && "editsByPath" in persisted
              ? mapWithCanonicalKeys(persistedRec)
              : current.editsByPath,
        };
      },
    },
  ),
);
