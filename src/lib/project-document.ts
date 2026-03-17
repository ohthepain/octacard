/**
 * Project document shape for API/Liveblocks/IndexedDB.
 */
import type { StackSample } from "@/stores/project-store";
import type { SampleEdits } from "@/stores/sample-edits-store";
import type { FormatSettings } from "@/stores/format-preset-store";

export interface StackData {
  id: string;
  name: string;
  sortOrder: number;
  slots: (StackSample | null)[];
  activeSlotIndex: number;
  previewMode: string;
  bpmAuto: boolean;
  globalTempoBpm: number;
}

export interface ProjectDocument {
  id: string;
  name: string;
  coverImageS3Key?: string | null;
  coverImageUrl?: string | null;
  createdAt: number;
  updatedAt: number;
  isPublic: boolean;
  activeStackId: string | null;
  stacks: StackData[];
  sampleEdits: Record<string, SampleEdits>;
  timeSignature?: { num: number; denom: number };
  transportDefaults?: { volume: number; muted: boolean };
  arrangementMetadata?: unknown;
  formatSettings?: FormatSettings;
}

/** Convert legacy document (slots at top level) to new format */
export function normalizeProjectDocument(doc: Record<string, unknown>): ProjectDocument {
  if (Array.isArray(doc.stacks) && doc.stacks.length > 0) {
    return doc as unknown as ProjectDocument;
  }
  const slots = (doc.slots as (StackSample | null)[]) ?? [];
  const activeSlotIndex = typeof doc.activeSlotIndex === "number" ? doc.activeSlotIndex : 0;
  const previewMode = (doc.previewMode as string) ?? "single";
  const bpmAuto = (doc.bpmAuto as boolean) ?? true;
  const globalTempoBpm = (doc.globalTempoBpm as number) ?? 120;
  const stackId = crypto.randomUUID();
  const stack: StackData = {
    id: stackId,
    name: "Stack 1",
    sortOrder: 0,
    slots,
    activeSlotIndex,
    previewMode,
    bpmAuto,
    globalTempoBpm,
  };
  return {
    ...doc,
    id: doc.id as string,
    name: (doc.name as string) ?? "Untitled",
    coverImageS3Key: doc.coverImageS3Key as string | null,
    coverImageUrl: doc.coverImageUrl as string | null,
    createdAt: (doc.createdAt as number) ?? 0,
    updatedAt: (doc.updatedAt as number) ?? 0,
    isPublic: (doc.isPublic as boolean) ?? false,
    activeStackId: stackId,
    stacks: [stack],
    sampleEdits: (doc.sampleEdits as Record<string, SampleEdits>) ?? {},
    timeSignature: doc.timeSignature as { num: number; denom: number } | undefined,
    transportDefaults: doc.transportDefaults as { volume: number; muted: boolean } | undefined,
    arrangementMetadata: doc.arrangementMetadata,
    formatSettings: doc.formatSettings as FormatSettings | undefined,
  } as ProjectDocument;
}
