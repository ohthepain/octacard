import {
  ChevronDown,
  Folder,
  FolderOpen,
  FolderPlus,
  Library,
  Pencil,
  Plus,
  Star,
  Trash2,
  Waves,
} from "lucide-react";
import { type DragEvent, type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Favorite } from "@/hooks/use-favorites";
import { cn } from "@/lib/utils";
import type { ProjectPackRef } from "@/stores/project-column-store";

type DataTransferItemWithFileSystemHandle = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

type RemoteDropItem =
  | {
      kind: "pack";
      id: string;
      name: string;
      coverImageProxyUrl?: string | null;
    }
  | { kind: "sample"; id: string; name: string };

/** Pass to `highlightedLocalFolderId` when the library grant row should appear active. */
export const HIGHLIGHT_LIBRARY_FOLDER_ROW = "__octacard_library_folder__";

interface ProjectColumnProps {
  currentPath: string;
  projectPacks: ProjectPackRef[];
  localFolders: Favorite[];
  globalPacks: ProjectPackRef[];
  onCreatePack: () => void;
  onEditProjectPack: (packId: string) => void;
  onOpenProjectPack: (packId: string) => void;
  onRemoveProjectPack: (packId: string) => void;
  onOpenGlobalPack: (packId: string) => void;
  onAddGlobalPack: (pack: ProjectPackRef) => void;
  onRemoveGlobalPack: (packId: string) => void;
  /** Open a saved local folder entry by favorite id (virtual path or permission handle). */
  onOpenLocalFolder: (favoriteId: string) => void | Promise<void>;
  /** Add a folder pinned by virtual path (under the current library tree). */
  onAddLocalFolder: (path: string, name: string) => void;
  /** Add an extra permission when the OS handle is not under the current library virtual tree. */
  onAddLocalFolderFromHandle?: (handle: FileSystemDirectoryHandle, name: string) => void | Promise<void>;
  onRemoveLocalFolder: (favoriteId: string) => void;
  /** User chose the main library grant (browse root). */
  onOpenLibraryFolder?: () => void | Promise<void>;
  hasSourceLibraryRoot: boolean;
  /** `HIGHLIGHT_LIBRARY_FOLDER_ROW` or a favorite `id` (first-fit / navigation). */
  highlightedLocalFolderId: string | null;
  onPickLocalFolderPermission?: () => void;
  onBrowseGlobalPacks?: () => void;
}

type SamplePoolNode =
  | { id: string; type: "sample"; name: string }
  | { id: string; type: "folder"; name: string; children: SamplePoolNode[] };

const SAMPLE_POOL: SamplePoolNode[] = [
  {
    id: "pool-drums",
    type: "folder",
    name: "Drum Hits",
    children: [
      { id: "pool-kick-01", type: "sample", name: "Kick 01" },
      { id: "pool-snare-03", type: "sample", name: "Snare 03" },
      {
        id: "pool-perc",
        type: "folder",
        name: "Percussion",
        children: [
          { id: "pool-perc-click", type: "sample", name: "Click Perc" },
          { id: "pool-perc-shaker", type: "sample", name: "Shaker Tight" },
        ],
      },
    ],
  },
  {
    id: "pool-tonal",
    type: "folder",
    name: "Tonal",
    children: [
      {
        id: "pool-chords",
        type: "folder",
        name: "Chord Stabs",
        children: [
          { id: "pool-chord-cm", type: "sample", name: "Cmin Stab" },
          { id: "pool-chord-fm", type: "sample", name: "Fmin Stab" },
        ],
      },
      { id: "pool-bass-sub", type: "sample", name: "Sub Bass One-Shot" },
    ],
  },
];

function Section({
  title,
  defaultOpen = true,
  headerAction,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  headerAction?: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="flex w-full items-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/50">
        <CollapsibleTrigger asChild>
          <button type="button" className="min-w-0 flex-1 truncate text-left">
            {title}
          </button>
        </CollapsibleTrigger>
        {headerAction}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted/80 hover:text-foreground"
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
          </button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent>
        <div className="mt-1 space-y-0.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}

function SectionHeaderIconButton({
  label,
  tooltip,
  onClick,
  icon = "plus",
}: {
  label: string;
  tooltip: string;
  onClick: () => void;
  icon?: "plus" | "folderPlus";
}) {
  const Icon = icon === "folderPlus" ? FolderPlus : Plus;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0 text-muted-foreground hover:text-foreground"
          aria-label={label}
          onClick={onClick}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

function SamplePoolTree({
  node,
  depth = 0,
}: {
  node: SamplePoolNode;
  depth?: number;
}) {
  if (node.type === "sample") {
    return (
      <div
        className="flex items-center gap-2 rounded px-2 py-1 text-sm text-muted-foreground"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        <Waves className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{node.name}</span>
      </div>
    );
  }

  return (
    <Collapsible defaultOpen>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted/50"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span className="truncate">{node.name}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-0.5">
          {node.children.map((child) => (
            <SamplePoolTree key={child.id} node={child} depth={depth + 1} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ProjectColumn({
  currentPath,
  projectPacks,
  localFolders,
  globalPacks,
  onCreatePack,
  onEditProjectPack,
  onOpenProjectPack,
  onRemoveProjectPack,
  onOpenGlobalPack,
  onAddGlobalPack,
  onRemoveGlobalPack,
  onOpenLocalFolder,
  onAddLocalFolder,
  onAddLocalFolderFromHandle,
  onRemoveLocalFolder,
  onOpenLibraryFolder,
  hasSourceLibraryRoot,
  highlightedLocalFolderId,
  onPickLocalFolderPermission,
  onBrowseGlobalPacks,
}: ProjectColumnProps) {
  void currentPath;
  const handleLocalDrop = async (event: DragEvent) => {
    event.preventDefault();

    const sourcePath = event.dataTransfer.getData("sourcePath");
    const sourceType = event.dataTransfer.getData("sourceType");
    if (sourcePath) {
      if (sourceType === "folder") {
        const name = sourcePath.split("/").filter(Boolean).pop() || sourcePath;
        onAddLocalFolder(sourcePath, name);
        return;
      }
      if (sourceType === "file") {
        const parts = sourcePath.split("/").filter(Boolean);
        if (parts.length >= 2) {
          const parentPath = `/${parts.slice(0, -1).join("/")}`;
          const parentName = parts[parts.length - 2];
          if (parentName) {
            onAddLocalFolder(parentPath, parentName);
          }
        }
        return;
      }
    }

    const items = event.dataTransfer.items;
    if (!items || items.length === 0) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "file") continue;

      try {
        const handle = await (
          item as DataTransferItemWithFileSystemHandle
        ).getAsFileSystemHandle?.();
        if (handle?.kind === "directory") {
          const dirHandle = handle as FileSystemDirectoryHandle;
          const { fileSystemService } = await import("@/lib/fileSystem");
          const path = fileSystemService.getVirtualPath(dirHandle, "source");
          if (path) {
            onAddLocalFolder(path, dirHandle.name);
          } else if (onAddLocalFolderFromHandle) {
            await onAddLocalFolderFromHandle(dirHandle, dirHandle.name);
          }
        }
      } catch {
        // Ignore handles we cannot read.
      }
    }
  };

  const handleGlobalDrop = (event: DragEvent) => {
    event.preventDefault();

    const payload = event.dataTransfer.getData("octacardRemoteItems");
    if (!payload) return;

    try {
      const parsed = JSON.parse(payload) as RemoteDropItem[];
      if (!Array.isArray(parsed)) return;
      for (const item of parsed) {
        if (item.kind === "pack") {
          onAddGlobalPack({
            id: item.id,
            name: item.name,
            coverImageProxyUrl: item.coverImageProxyUrl ?? undefined,
          });
        }
      }
    } catch {
      // Ignore malformed payloads.
    }
  };

  const handleDragOver = (event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };

  return (
    <div className="h-full min-w-0 border-r border-border bg-muted/40">
      <ScrollArea className="h-[calc(100%-49px)]">
        <div className="space-y-3 p-2">
          <Section
            title="Local Packs"
            headerAction={
              <SectionHeaderIconButton
                label="Create new sample pack"
                tooltip="Create a new sample pack for export"
                onClick={onCreatePack}
              />
            }
          >
            {projectPacks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border px-2 py-3">
                <div className="text-xs text-muted-foreground">
                  No local packs in this project yet.
                </div>
                <Button
                  size="sm"
                  className="mt-2 h-7 w-full gap-1"
                  onClick={onCreatePack}
                >
                  <Plus className="h-3.5 w-3.5" />
                  New pack
                </Button>
              </div>
            ) : (
              projectPacks.map((pack) => (
                <div
                  key={pack.id}
                  className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/50"
                >
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm"
                    onClick={() => onOpenProjectPack(pack.id)}
                  >
                    {pack.coverImageProxyUrl ? (
                      <img
                        src={pack.coverImageProxyUrl}
                        alt=""
                        className="h-5 w-5 shrink-0 rounded-sm object-cover"
                      />
                    ) : (
                      <Folder className="h-3.5 w-3.5 shrink-0 text-amber-600" />
                    )}
                    <span className="truncate">{pack.name}</span>
                  </button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => onEditProjectPack(pack.id)}
                    aria-label={`Edit ${pack.name}`}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                    onClick={() => onRemoveProjectPack(pack.id)}
                    aria-label={`Remove ${pack.name} from project packs`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </Section>

          <Section
            title="Local folder permissions"
            headerAction={
              onPickLocalFolderPermission ? (
                <SectionHeaderIconButton
                  label="Add folder permission"
                  tooltip="Add disk folder access (folder icon). No library yet — you will choose your library folder first."
                  onClick={onPickLocalFolderPermission}
                  icon="folderPlus"
                />
              ) : undefined
            }
          >
            <div
              onDragOver={handleDragOver}
              onDrop={(event) => void handleLocalDrop(event)}
            >
              {!hasSourceLibraryRoot ? (
                <div className="rounded-lg border border-dashed border-border px-2 py-3 text-xs text-muted-foreground">
                  Open Local mode and choose a library folder in the file pane first. Then you can add extra folder
                  permissions here.
                </div>
              ) : (
                <>
                  {onOpenLibraryFolder ? (
                    <div className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/50">
                      <button
                        type="button"
                        className={cn(
                          "flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm",
                          highlightedLocalFolderId === HIGHLIGHT_LIBRARY_FOLDER_ROW
                            ? "bg-primary/10 text-primary"
                            : "",
                        )}
                        onClick={() => onOpenLibraryFolder()}
                      >
                        <FolderOpen className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Library</span>
                      </button>
                    </div>
                  ) : null}
                  {localFolders.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-border px-2 py-3 text-xs text-muted-foreground">
                      Drag folders here or use + to save access to another folder. Names are reminders only.
                    </div>
                  ) : (
                    localFolders.map((folder) => (
                      <div
                        key={folder.id}
                        className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/50"
                      >
                        <button
                          type="button"
                          className={cn(
                            "flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm",
                            highlightedLocalFolderId === folder.id ? "bg-primary/10 text-primary" : "",
                          )}
                          onClick={() => onOpenLocalFolder(folder.id)}
                          data-testid={
                            folder.path
                              ? `favorite-open-source-${folder.path.replace(/[^a-zA-Z0-9_-]/g, "_")}`
                              : undefined
                          }
                        >
                          <Star className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{folder.name}</span>
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                          onClick={() => onRemoveLocalFolder(folder.id)}
                          aria-label={`Remove ${folder.name}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          </Section>

          <Section
            title="Global Packs"
            headerAction={
              onBrowseGlobalPacks ? (
                <SectionHeaderIconButton
                  label="Browse packs from other users"
                  tooltip="Browse packs from other users"
                  onClick={onBrowseGlobalPacks}
                />
              ) : undefined
            }
          >
            <div onDragOver={handleDragOver} onDrop={handleGlobalDrop}>
              {globalPacks.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-2 py-3 text-xs text-muted-foreground">
                  Drag global packs here for quick access.
                </div>
              ) : (
                globalPacks.map((pack) => (
                  <div
                    key={pack.id}
                    className="group flex items-center gap-1 rounded px-1 py-0.5 hover:bg-muted/50"
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1 text-left text-sm"
                      onClick={() => onOpenGlobalPack(pack.id)}
                    >
                      <Library className="h-3.5 w-3.5 shrink-0 text-sky-600" />
                      <span className="truncate">{pack.name}</span>
                    </button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => onRemoveGlobalPack(pack.id)}
                      aria-label={`Remove ${pack.name} from global packs`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Section>

          <Section title="Sample Pool">
            <div className="space-y-0.5">
              {SAMPLE_POOL.map((node) => (
                <SamplePoolTree key={node.id} node={node} />
              ))}
            </div>
          </Section>
        </div>
      </ScrollArea>
    </div>
  );
}
