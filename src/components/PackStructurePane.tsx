import {
  BarChart3,
  ChevronDown,
  FolderOpen,
  FolderPlus,
  Loader2,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  formatCredits,
  formatSampleSizeMb,
  joinSampleMetaLine,
  PackSampleListRow,
} from "@/components/PackSampleListRow";
import { SampleAnalysisDialog } from "@/components/SampleAnalysisDialog";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { parseRemoteSampleId } from "@/lib/audio-resolver";
import { fileSystemService } from "@/lib/fileSystem";
import { isPackEntryAudio, sourceRefToOpenParams } from "@/lib/pack-source-ref";
import {
  getPackStructure,
  type PackStructure,
  type ProjectPackEntry,
  type ProjectPackFolder,
  putPackStructure,
} from "@/lib/project-packs";
import { getSample } from "@/lib/remote-library";
import { resolveFileDrop } from "@/lib/resolveFileDrop";
import { fromTempPath, getFileMeta, isTempPath } from "@/lib/temp-files-store";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/stores/project-store";
import { useWaveformEditorStore } from "@/stores/waveform-editor-store";

const AUDIO_EXT = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i;
function isAudioFile(name: string): boolean {
  return AUDIO_EXT.test(name);
}

function pathToSourceRef(path: string, sourcePane: "source" | "dest"): string {
  if (path.startsWith("temp://") || path.startsWith("remote://")) return path;
  return sourcePane === "dest" ? `dest:${path}` : path;
}

function isAddEntryPayload(x: unknown): x is AddEntryPayload {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.sourceRef === "string" &&
    typeof o.regionStart === "number" &&
    typeof o.regionEnd === "number" &&
    typeof o.defaultName === "string"
  );
}

/** Drag sources: custom pack payload, FilePane / TempFiles (`sourcePath` + `sourcePane`), or OS files. */
function parseSyncPackDropPayloads(e: React.DragEvent): AddEntryPayload[] {
  const packPayload = e.dataTransfer.getData("octacard-pack-entry");
  if (packPayload) {
    try {
      const data = JSON.parse(packPayload) as unknown;
      if (isAddEntryPayload(data)) return [data];
    } catch {
      return [];
    }
  }

  const sourcePaneRaw = e.dataTransfer.getData("sourcePane");
  const sourcePane: "source" | "dest" =
    sourcePaneRaw === "dest" ? "dest" : "source";

  const multiple = e.dataTransfer.getData("multipleItems");
  if (multiple) {
    try {
      const arr = JSON.parse(multiple) as unknown;
      if (!Array.isArray(arr)) return [];
      const out: AddEntryPayload[] = [];
      for (const item of arr) {
        if (!item || typeof item !== "object") continue;
        const o = item as { path?: string; name?: string; type?: string };
        if (
          o.type !== "file" ||
          typeof o.path !== "string" ||
          typeof o.name !== "string"
        )
          continue;
        if (!isAudioFile(o.name)) continue;
        out.push({
          sourceRef: pathToSourceRef(o.path, sourcePane),
          regionStart: 0,
          regionEnd: 0,
          defaultName: o.name,
        });
      }
      return out;
    } catch {
      return [];
    }
  }

  const sourcePath = e.dataTransfer.getData("sourcePath");
  const sourceType = e.dataTransfer.getData("sourceType");
  if (sourcePath && sourceType === "file") {
    const base = sourcePath.split("/").filter(Boolean).pop() || sourcePath;
    if (!isAudioFile(base)) return [];
    return [
      {
        sourceRef: pathToSourceRef(sourcePath, sourcePane),
        regionStart: 0,
        regionEnd: 0,
        defaultName: base,
      },
    ];
  }

  return [];
}

async function parseAsyncPackDropPayloads(
  e: React.DragEvent,
): Promise<AddEntryPayload[]> {
  const items = e.dataTransfer.items;
  const out: AddEntryPayload[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item?.kind !== "file") continue;
    const file = item.getAsFile();
    if (!file || !isAudioFile(file.name)) continue;
    const result = await resolveFileDrop(file, { paneType: "source" });
    if (result.success && result.path && result.name) {
      out.push({
        sourceRef: pathToSourceRef(result.path, "source"),
        regionStart: 0,
        regionEnd: 0,
        defaultName: result.name,
      });
    } else if (!result.success && result.error) {
      toast.error(result.error);
    }
  }
  return out;
}

export interface AddEntryPayload {
  sourceRef: string;
  regionStart: number;
  regionEnd: number;
  defaultName: string;
}

export type PackEntryOpenPayload = {
  path: string;
  name: string;
  paneType: "source" | "dest";
};

interface PackStructurePaneProps {
  projectId: string;
  packId: string;
  /** Shown in sample rows as the “pack” segment of the subtitle (e.g. local project pack name). */
  packDisplayName?: string;
  /** Called when structure is updated (e.g. for publish button state) */
  onStructureChange?: (structure: PackStructure) => void;
  /** Sync file selection in navigation columns (BPM, etc.) when a pack entry is opened */
  onPackEntryOpen?: (payload: PackEntryOpenPayload) => void;
}

function buildFolderTree(
  folders: ProjectPackFolder[],
): Map<string | null, ProjectPackFolder[]> {
  const byParent = new Map<string | null, ProjectPackFolder[]>();
  for (const f of folders) {
    const parentId = f.parentId ?? null;
    const list = byParent.get(parentId) ?? [];
    list.push(f);
    byParent.set(parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort(
      (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
    );
  }
  return byParent;
}

function FolderTree({
  folder,
  entries,
  foldersByParent,
  depth,
  packDisplayName,
  onRenameFolder,
  onDeleteFolder,
  onRenameEntry,
  onDeleteEntry,
  onPackDrop,
  onEntryActivate,
  onOpenRemoteAnalysis,
}: {
  folder: ProjectPackFolder;
  entries: ProjectPackEntry[];
  foldersByParent: Map<string | null, ProjectPackFolder[]>;
  depth: number;
  packDisplayName: string;
  onRenameFolder: (id: string, name: string) => void;
  onDeleteFolder: (id: string) => void;
  onRenameEntry: (id: string, displayName: string) => void;
  onDeleteEntry: (id: string) => void;
  onPackDrop?: (e: React.DragEvent, folderId: string | null) => void;
  onEntryActivate?: (entry: ProjectPackEntry) => void;
  onOpenRemoteAnalysis: (sampleId: string, name: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const children = foldersByParent.get(folder.id) ?? [];
  const childEntries = entries.filter((e) => e.folderId === folder.id);

  const handleFolderRowDrop = useCallback(
    (e: React.DragEvent) => {
      if (!onPackDrop) return;
      onPackDrop(e, folder.id);
    },
    [folder.id, onPackDrop],
  );

  const handleFolderRowDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className="group flex items-center rounded"
        onDragOver={handleFolderRowDragOver}
        onDrop={handleFolderRowDrop}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted/50",
              depth > 0 && "ml-2",
            )}
            style={{ paddingLeft: `${depth * 12 + 8}px` }}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 shrink-0 transition-transform",
                !open && "-rotate-90",
              )}
            />
            <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-600" />
            <span className="truncate">{folder.name}</span>
          </button>
        </CollapsibleTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-6 w-6 shrink-0 p-0 opacity-0 group-hover:opacity-100"
              aria-label={`Folder actions for ${folder.name}`}
              onClick={(e) => e.stopPropagation()}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => onRenameFolder(folder.id, folder.name)}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => onDeleteFolder(folder.id)}
              className="text-destructive"
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <CollapsibleContent>
        <div className="space-y-0.5">
          {childEntries.map((entry) => (
            <PackStructureEntryRow
              key={entry.id}
              entry={entry}
              depth={depth + 1}
              packDisplayName={packDisplayName}
              onRename={onRenameEntry}
              onDelete={onDeleteEntry}
              onPackDrop={onPackDrop}
              onEntryActivate={onEntryActivate}
              onOpenRemoteAnalysis={onOpenRemoteAnalysis}
            />
          ))}
          {children.map((child) => (
            <FolderTree
              key={child.id}
              folder={child}
              entries={entries}
              foldersByParent={foldersByParent}
              depth={depth + 1}
              packDisplayName={packDisplayName}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onRenameEntry={onRenameEntry}
              onDeleteEntry={onDeleteEntry}
              onPackDrop={onPackDrop}
              onEntryActivate={onEntryActivate}
              onOpenRemoteAnalysis={onOpenRemoteAnalysis}
            />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function PackStructureEntryRow({
  entry,
  depth,
  packDisplayName,
  onRename,
  onDelete,
  onPackDrop,
  onEntryActivate,
  onOpenRemoteAnalysis,
}: {
  entry: ProjectPackEntry;
  depth: number;
  packDisplayName: string;
  onRename: (id: string, displayName: string) => void;
  onDelete: (id: string) => void;
  onPackDrop?: (e: React.DragEvent, folderId: string | null) => void;
  onEntryActivate?: (entry: ProjectPackEntry) => void;
  onOpenRemoteAnalysis: (sampleId: string, name: string) => void;
}) {
  const { path, paneType } = useMemo(
    () => sourceRefToOpenParams(entry.sourceRef, entry.displayName),
    [entry.sourceRef, entry.displayName],
  );
  const isAudio = isPackEntryAudio(entry);
  const remoteSampleId = parseRemoteSampleId(path);
  const [subtitle, setSubtitle] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (remoteSampleId) {
        try {
          const s = await getSample(remoteSampleId);
          if (cancelled) return;
          setSubtitle(
            joinSampleMetaLine([s.packName ?? "Library", formatCredits(0)]),
          );
        } catch {
          if (!cancelled) {
            setSubtitle(joinSampleMetaLine(["Library", formatCredits(0)]));
          }
        }
        return;
      }

      if (isTempPath(path)) {
        const vp = fromTempPath(path);
        const meta = vp ? await getFileMeta(vp) : null;
        if (cancelled) return;
        setSubtitle(
          joinSampleMetaLine([
            "Temp Files",
            formatCredits(0),
            meta ? formatSampleSizeMb(meta.sizeBytes) : "",
          ]),
        );
        return;
      }

      const stats = await fileSystemService.getFileStats(path, paneType);
      if (cancelled) return;
      const st = stats.success ? stats.data : undefined;
      if (st?.isFile && st.size > 0) {
        setSubtitle(
          joinSampleMetaLine([
            packDisplayName,
            formatCredits(0),
            formatSampleSizeMb(st.size),
          ]),
        );
      } else {
        setSubtitle(joinSampleMetaLine([packDisplayName, formatCredits(0)]));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [path, paneType, packDisplayName, remoteSampleId]);

  const handleEntryDrop = useCallback(
    (e: React.DragEvent) => {
      if (!onPackDrop) return;
      onPackDrop(e, entry.folderId);
    },
    [entry.folderId, onPackDrop],
  );

  const handleEntryDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!onPackDrop) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
    },
    [onPackDrop],
  );

  const handleActivate = useCallback(() => {
    if (!isAudio) return;
    onEntryActivate?.(entry);
  }, [entry, isAudio, onEntryActivate]);

  return (
    <div
      className="flex w-full min-w-0 items-start gap-0"
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
      onDragOver={handleEntryDragOver}
      onDrop={handleEntryDrop}
    >
      <PackSampleListRow
        className="flex-1"
        name={entry.displayName}
        subtitle={subtitle || "…"}
        playPath={path}
        paneType={paneType}
        showPlay={isAudio}
        onActivate={handleActivate}
        menuContent={
          <>
            <DropdownMenuItem
              onSelect={() => onRename(entry.id, entry.displayName)}
            >
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive"
              onSelect={() => onDelete(entry.id)}
            >
              Remove from pack
            </DropdownMenuItem>
            {remoteSampleId ? (
              <DropdownMenuItem
                onSelect={() =>
                  onOpenRemoteAnalysis(remoteSampleId, entry.displayName)
                }
              >
                <BarChart3 className="mr-2 h-4 w-4" />
                View analysis results
              </DropdownMenuItem>
            ) : null}
          </>
        }
      />
    </div>
  );
}

export function PackStructurePane({
  projectId,
  packId,
  packDisplayName = "This pack",
  onStructureChange,
  onPackEntryOpen,
}: PackStructurePaneProps) {
  const [structure, setStructure] = useState<PackStructure | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [renameDialog, setRenameDialog] = useState<{
    type: "folder" | "entry";
    id: string;
    currentName: string;
  } | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [analysisSampleId, setAnalysisSampleId] = useState<string | null>(null);
  const [analysisSampleName, setAnalysisSampleName] = useState<string>("");

  const handleOpenRemoteAnalysis = useCallback(
    (sampleId: string, name: string) => {
      setAnalysisSampleId(sampleId);
      setAnalysisSampleName(name);
      setAnalysisDialogOpen(true);
    },
    [],
  );

  const load = useCallback(async () => {
    if (!projectId || !packId) return;
    setLoading(true);
    try {
      const data = await getPackStructure(projectId, packId);
      setStructure(data);
      onStructureChange?.(data);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to load pack structure",
      );
      setStructure({ folders: [], entries: [] });
    } finally {
      setLoading(false);
    }
  }, [projectId, packId, onStructureChange]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (next: PackStructure) => {
      if (!projectId || !packId) return;
      setSaving(true);
      try {
        await putPackStructure(projectId, packId, next);
        setStructure(next);
        onStructureChange?.(next);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Failed to save pack structure",
        );
      } finally {
        setSaving(false);
      }
    },
    [projectId, packId, onStructureChange],
  );

  const handleAddFolder = useCallback(() => {
    const name = newFolderName.trim() || "NewFolder";
    setNewFolderName("");
    if (!structure) return;
    const nextFolder: ProjectPackFolder = {
      id: crypto.randomUUID(),
      parentId: null,
      name,
      sortOrder: structure.folders.length,
    };
    const next: PackStructure = {
      folders: [...structure.folders, nextFolder],
      entries: structure.entries,
    };
    void save(next);
  }, [structure, newFolderName, save]);

  const handleRenameFolder = useCallback(
    (id: string, newName: string) => {
      setRenameDialog(null);
      if (!structure) return;
      const next: PackStructure = {
        folders: structure.folders.map((f) =>
          f.id === id ? { ...f, name: newName } : f,
        ),
        entries: structure.entries,
      };
      void save(next);
    },
    [structure, save],
  );

  const handleDeleteFolder = useCallback(
    (id: string) => {
      if (!structure) return;
      const toRemove = new Set<string>([id]);
      let added = true;
      while (added) {
        added = false;
        for (const f of structure.folders) {
          if (f.parentId && toRemove.has(f.parentId) && !toRemove.has(f.id)) {
            toRemove.add(f.id);
            added = true;
          }
        }
      }
      const next: PackStructure = {
        folders: structure.folders.filter((f) => !toRemove.has(f.id)),
        entries: structure.entries.map((e) =>
          e.folderId && toRemove.has(e.folderId) ? { ...e, folderId: null } : e,
        ),
      };
      void save(next);
    },
    [structure, save],
  );

  const handleRenameEntry = useCallback(
    (id: string, displayName: string) => {
      setRenameDialog(null);
      if (!structure) return;
      const next: PackStructure = {
        folders: structure.folders,
        entries: structure.entries.map((e) =>
          e.id === id ? { ...e, displayName } : e,
        ),
      };
      void save(next);
    },
    [structure, save],
  );

  const handleDeleteEntry = useCallback(
    (id: string) => {
      if (!structure) return;
      const next: PackStructure = {
        folders: structure.folders,
        entries: structure.entries.filter((e) => e.id !== id),
      };
      void save(next);
    },
    [structure, save],
  );

  const applyPayloads = useCallback(
    (folderId: string | null, payloads: AddEntryPayload[]) => {
      if (payloads.length === 0) return;
      if (!structure) return;
      const newEntries: ProjectPackEntry[] = payloads.map((payload, i) => ({
        id: crypto.randomUUID(),
        folderId,
        displayName: payload.defaultName.trim() || payload.defaultName,
        sourceRef: payload.sourceRef,
        regionStart: payload.regionStart,
        regionEnd: payload.regionEnd,
        sortOrder: structure.entries.length + i,
      }));
      void save({
        folders: structure.folders,
        entries: [...structure.entries, ...newEntries],
      });
    },
    [structure, save],
  );

  const handlePackDrop = useCallback(
    (e: React.DragEvent, folderId: string | null) => {
      e.preventDefault();
      e.stopPropagation();
      const sync = parseSyncPackDropPayloads(e);
      if (sync.length > 0) {
        applyPayloads(folderId, sync);
        return;
      }
      void (async () => {
        const asyncPayloads = await parseAsyncPackDropPayloads(e);
        if (asyncPayloads.length > 0) {
          applyPayloads(folderId, asyncPayloads);
        }
      })();
    },
    [applyPayloads],
  );

  const handleEntryActivate = useCallback(
    (entry: ProjectPackEntry) => {
      if (!isPackEntryAudio(entry)) return;
      const { path, paneType, name } = sourceRefToOpenParams(
        entry.sourceRef,
        entry.displayName,
      );
      onPackEntryOpen?.({ path, name, paneType });
      const previewMode =
        useProjectStore.getState().getActiveStack()?.previewMode ?? "single";
      if (previewMode === "multi") {
        useProjectStore
          .getState()
          .putSampleInActiveSlot({ path, name, paneType });
        const active = useProjectStore.getState().getActiveStack();
        const slots = active?.slots ?? [];
        const activeSlotIndex = active?.activeSlotIndex ?? 0;
        const sample = slots[activeSlotIndex];
        if (sample) {
          useWaveformEditorStore
            .getState()
            .openWithFileFromMulti(
              sample.path,
              sample.name,
              sample.paneType,
              sample.id,
            );
        }
      } else {
        useWaveformEditorStore.getState().openWithFile(path, name, paneType);
      }
    },
    [onPackEntryOpen],
  );

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }, []);

  const rootEntries = structure?.entries.filter((e) => !e.folderId) ?? [];
  const foldersByParent = structure
    ? buildFolderTree(structure.folders)
    : new Map<string | null, ProjectPackFolder[]>();
  const rootFolders = foldersByParent.get(null) ?? [];

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-2 py-2">
        <Input
          placeholder="New folder name"
          value={newFolderName}
          onChange={(e) => setNewFolderName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleAddFolder()}
          className="h-8 flex-1"
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1"
          onClick={handleAddFolder}
        >
          <FolderPlus className="h-3.5 w-3.5" />
          Add folder
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-2 p-2">
          <div className="space-y-0.5">
            {rootEntries.map((entry) => (
              <PackStructureEntryRow
                key={entry.id}
                entry={entry}
                depth={0}
                packDisplayName={packDisplayName}
                onRename={(id, name) =>
                  setRenameDialog({ type: "entry", id, currentName: name })
                }
                onDelete={handleDeleteEntry}
                onPackDrop={handlePackDrop}
                onEntryActivate={handleEntryActivate}
                onOpenRemoteAnalysis={handleOpenRemoteAnalysis}
              />
            ))}
            {rootFolders.map((folder) => (
              <FolderTree
                key={folder.id}
                folder={folder}
                entries={structure?.entries ?? []}
                foldersByParent={foldersByParent}
                depth={0}
                packDisplayName={packDisplayName}
                onRenameFolder={(id, name) =>
                  setRenameDialog({ type: "folder", id, currentName: name })
                }
                onDeleteFolder={handleDeleteFolder}
                onRenameEntry={(id, name) =>
                  setRenameDialog({ type: "entry", id, currentName: name })
                }
                onDeleteEntry={handleDeleteEntry}
                onPackDrop={handlePackDrop}
                onEntryActivate={handleEntryActivate}
                onOpenRemoteAnalysis={handleOpenRemoteAnalysis}
              />
            ))}
          </div>
          <div
            className={cn(
              "flex min-h-[120px] flex-col items-center justify-center rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground",
              structure &&
                structure.folders.length === 0 &&
                structure.entries.length === 0 &&
                "min-h-[160px]",
            )}
            onDragOver={handleRootDragOver}
            onDrop={(e) => handlePackDrop(e, null)}
          >
            {structure &&
            structure.folders.length === 0 &&
            structure.entries.length === 0 ? (
              <>
                <p className="font-medium text-foreground">Drop zone</p>
                <p className="mt-1 max-w-sm">
                  Drag samples from the file browser, stack, or Temp Files here
                  to add them to the pack.
                </p>
              </>
            ) : (
              <p>
                Drop here to add at the{" "}
                <span className="text-foreground">pack root</span>, or drop on a
                folder or sample row above.
              </p>
            )}
          </div>
        </div>
      </ScrollArea>
      {saving && (
        <div className="flex items-center gap-2 border-t border-border px-2 py-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Saving…
        </div>
      )}

      <RenameDialog
        open={!!renameDialog}
        type={renameDialog?.type ?? "folder"}
        currentName={renameDialog?.currentName ?? ""}
        onClose={() => setRenameDialog(null)}
        onSave={(name) => {
          if (renameDialog) {
            if (renameDialog.type === "folder")
              handleRenameFolder(renameDialog.id, name);
            else handleRenameEntry(renameDialog.id, name);
          }
        }}
      />
      <SampleAnalysisDialog
        open={analysisDialogOpen}
        onOpenChange={setAnalysisDialogOpen}
        sampleId={analysisSampleId}
        sampleName={analysisSampleName}
      />
    </div>
  );
}

function RenameDialog({
  open,
  type,
  currentName,
  onClose,
  onSave,
}: {
  open: boolean;
  type: "folder" | "entry";
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(currentName);
  useEffect(() => {
    if (open) setName(currentName);
  }, [open, currentName]);

  const handleSave = () => {
    const trimmed = name.trim();
    if (trimmed) {
      onSave(trimmed);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename {type}</DialogTitle>
          <DialogDescription>
            {type === "folder"
              ? "Enter a new name for the folder."
              : "Enter a display name for this sample."}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="rename-input">Name</Label>
            <Input
              id="rename-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSave()}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
