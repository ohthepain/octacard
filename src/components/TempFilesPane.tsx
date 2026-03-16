import { useState, useEffect, useCallback, useRef } from "react";
import {
  Folder,
  File,
  ChevronRight,
  Trash2,
  Plus,
  FolderInput,
  Loader2,
  Play,
  Square,
  Download,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  TEMP_FILES_ROOT,
  TEMP_PATH_PREFIX,
  deleteFile,
  deleteFolder,
  fromTempPath,
  getFile,
  getTotalBytesUsed,
  listAllFilesUnder,
  listDirectory,
  putFile,
  toTempPath,
  type ListDirectoryResult,
} from "@/lib/temp-files-store";
import { usePlayerStore } from "@/stores/player-store";
import { useWaveformEditorStore } from "@/stores/waveform-editor-store";
import { useProjectStore } from "@/stores/project-store";
import { sanitizeFilenameMinimal } from "@/lib/filename";
import JSZip from "jszip";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function isAudioFile(fileName: string): boolean {
  return /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i.test(fileName);
}

function TempFilesPlayButton({ path, paneType }: { path: string; name: string; paneType: "source" | "dest" }) {
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const mode = usePlayerStore((s) => s.mode);
  const singleFile = usePlayerStore((s) => s.singleFile);
  const stack = usePlayerStore((s) => s.stack);
  const playSingle = usePlayerStore((s) => s.playSingle);
  const stop = usePlayerStore((s) => s.stop);

  const isThisPlaying =
    isPlaying &&
    (mode === "single"
      ? singleFile?.path === path && singleFile?.paneType === paneType
      : stack.some((s) => s.path === path && s.paneType === paneType));

  return (
    <Button
      size="sm"
      variant="ghost"
      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 shrink-0"
      aria-label={isThisPlaying ? "Stop" : "Play"}
      onClick={(e) => {
        e.stopPropagation();
        if (isThisPlaying) {
          stop();
        } else {
          playSingle(path, paneType);
        }
      }}
    >
      {isThisPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
    </Button>
  );
}

interface TempFileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  path: string;
  children?: TempFileNode[];
  size?: number;
  loaded?: boolean;
  isLoading?: boolean;
}

function listingToNodes(result: ListDirectoryResult): TempFileNode[] {
  const nodes: TempFileNode[] = [];
  for (const f of result.folders) {
    nodes.push({
      id: f.path,
      name: f.name,
      type: "folder",
      path: f.path,
      loaded: false,
    });
  }
  for (const f of result.files) {
    nodes.push({
      id: f.path,
      name: f.name,
      type: "file",
      path: f.path,
      size: f.size,
      loaded: true,
    });
  }
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return nodes;
}

interface TempFilesPaneProps {
  paneName: "source" | "dest";
  title?: string;
  onSelectionChange?: (selection: { path: string; type: "file" | "folder"; name: string } | null) => void;
  onPathChange?: (path: string) => void;
  refreshToken?: number;
  /** When set, expand this path in the folder tree (e.g. from Temp Files favorite). Clear via onRequestedPathHandled. */
  requestedPath?: string | null;
  onRequestedPathHandled?: () => void;
}

const ROOT_PATH = TEMP_PATH_PREFIX + TEMP_FILES_ROOT;

export function TempFilesPane({
  paneName,
  title = "Temp Files",
  onSelectionChange,
  onPathChange,
  refreshToken = 0,
  requestedPath,
  onRequestedPathHandled,
}: TempFilesPaneProps) {
  const paneType = paneName === "dest" ? "dest" : "source";
  const [fileTree, setFileTree] = useState<TempFileNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [totalBytes, setTotalBytes] = useState(0);
  const [addingFiles, setAddingFiles] = useState(false);
  const [trashConfirmPath, setTrashConfirmPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const putSampleInActiveSlot = useProjectStore((s) => s.putSampleInActiveSlot);
  const previewMode = useProjectStore((s) => s.getActiveStack()?.previewMode ?? "single");

  /** Path to add files to: selected folder, or root when nothing/a file is selected */
  const addTargetPath = (() => {
    if (!selectedItem) return TEMP_FILES_ROOT;
    const node = findNodeById(fileTree, selectedItem);
    if (node?.type === "folder") {
      const vp = fromTempPath(node.path);
      return vp ?? TEMP_FILES_ROOT;
    }
    if (node?.type === "file") {
      const vp = fromTempPath(node.path);
      if (vp) {
        const parts = vp.split("/").filter(Boolean);
        parts.pop();
        return parts.length > 0 ? `/${parts.join("/")}` : TEMP_FILES_ROOT;
      }
    }
    return TEMP_FILES_ROOT;
  })();

  const loadRoot = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listDirectory(TEMP_FILES_ROOT);
      const nodes = listingToNodes(result);
      setFileTree(nodes);
      const bytes = await getTotalBytesUsed();
      setTotalBytes(bytes);
    } catch (err) {
      toast.error("Failed to load Temp Files", { description: String(err) });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDirectoryForNode = useCallback(async (node: TempFileNode) => {
    const vp = fromTempPath(node.path) ?? node.path;
    const result = await listDirectory(vp);
    return listingToNodes(result);
  }, []);

  const toggleFolder = useCallback(
    async (node: TempFileNode) => {
      const newExpanded = new Set(expandedFolders);
      if (newExpanded.has(node.id)) {
        newExpanded.delete(node.id);
      } else {
        newExpanded.add(node.id);
        if (!node.loaded && node.type === "folder") {
          setFileTree((prev) =>
            updateNodeInTree(prev, node.id, (n) => ({ ...n, isLoading: true })),
          );
          try {
            const children = await loadDirectoryForNode(node);
            setFileTree((prev) =>
              updateNodeInTree(prev, node.id, (n) => ({
                ...n,
                children,
                loaded: true,
                isLoading: false,
              })),
            );
          } catch (err) {
            toast.error("Failed to load folder", { description: String(err) });
            setFileTree((prev) =>
              updateNodeInTree(prev, node.id, (n) => ({ ...n, isLoading: false })),
            );
          }
        }
      }
      setExpandedFolders(newExpanded);
    },
    [expandedFolders, loadDirectoryForNode],
  );

  const refreshTree = useCallback(async () => {
    const bytes = await getTotalBytesUsed();
    setTotalBytes(bytes);
    const refreshNode = async (nodes: TempFileNode[]): Promise<TempFileNode[]> => {
      const out: TempFileNode[] = [];
      for (const n of nodes) {
        if (n.type === "folder" && n.loaded) {
          try {
            const result = await listDirectory(fromTempPath(n.path) ?? n.path);
            const children = listingToNodes(result);
            out.push({
              ...n,
              children: await refreshNode(children),
            });
          } catch {
            out.push(n);
          }
        } else {
          out.push(n);
        }
      }
      return out;
    };
    try {
      const result = await listDirectory(TEMP_FILES_ROOT);
      const rootNodes = listingToNodes(result, TEMP_FILES_ROOT);
      const refreshed = await refreshNode(rootNodes);
      setFileTree(refreshed);
    } catch (err) {
      toast.error("Failed to refresh", { description: String(err) });
    }
  }, []);

  useEffect(() => {
    void loadRoot();
  }, [loadRoot, refreshToken]);

  const expandPathAndSelect = useCallback(
    async (targetPath: string) => {
      const vp = fromTempPath(targetPath);
      if (!vp || vp === TEMP_FILES_ROOT) {
        setSelectedItem(ROOT_PATH);
        return;
      }
      const parts = vp.split("/").filter(Boolean);
      if (parts.length <= 1) {
        setSelectedItem(ROOT_PATH);
        return;
      }
      const pathSegments: string[] = [];
      for (let i = 1; i < parts.length; i++) {
        pathSegments.push(toTempPath(`/${parts.slice(0, i + 1).join("/")}`));
      }
      let currentTree = [...fileTree];
      const newExpanded = new Set(expandedFolders);
      for (const path of pathSegments) {
        const node = findNodeByPath(currentTree, path);
        if (node) {
          if (!newExpanded.has(node.id)) {
            newExpanded.add(node.id);
            if (!node.loaded && node.type === "folder") {
              try {
                const children = await loadDirectoryForNode(node);
                currentTree = updateNodeInTree(currentTree, node.id, (n) => ({
                  ...n,
                  children,
                  loaded: true,
                }));
                setFileTree(currentTree);
              } catch {
                // ignore
              }
            }
          }
        }
      }
      setExpandedFolders(newExpanded);
      setSelectedItem(targetPath);
    },
    [fileTree, expandedFolders, loadDirectoryForNode],
  );

  useEffect(() => {
    if (requestedPath?.startsWith(TEMP_PATH_PREFIX)) {
      void expandPathAndSelect(requestedPath).finally(() => {
        onRequestedPathHandled?.();
      });
    }
  }, [requestedPath, onRequestedPathHandled, expandPathAndSelect]);

  useEffect(() => {
    const path = selectedItem ?? ROOT_PATH;
    onPathChange?.(path);
  }, [selectedItem, onPathChange]);

  const handleAddFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    void (async () => {
      setAddingFiles(true);
      try {
        const basePath = addTargetPath === TEMP_FILES_ROOT ? TEMP_FILES_ROOT : addTargetPath;
        let count = 0;
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file) continue;
          const safeName = sanitizeFilenameMinimal(file.name) || `file_${i}`;
          const targetPath = basePath === TEMP_FILES_ROOT ? `${TEMP_FILES_ROOT}/${safeName}` : `${basePath}/${safeName}`;
          await putFile(targetPath, file, safeName);
          count++;
        }
        toast.success(`Added ${count} file${count !== 1 ? "s" : ""}`);
        await refreshTree();
      } catch (err) {
        toast.error("Failed to add files", { description: String(err) });
      } finally {
        setAddingFiles(false);
        e.target.value = "";
      }
    })();
  };

  const handleAddFolder = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    void (async () => {
      setAddingFiles(true);
      try {
        const basePath = addTargetPath === TEMP_FILES_ROOT ? TEMP_FILES_ROOT : addTargetPath;
        let count = 0;
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file) continue;
          const webkitPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
          const relativePath = webkitPath || file.name;
          const safeRelativePath = relativePath
            .split("/")
            .map((seg) => sanitizeFilenameMinimal(seg) || "file")
            .join("/");
          const targetPath = `${basePath}/${safeRelativePath}`;
          const fileName = safeRelativePath.split("/").pop() || file.name;
          await putFile(targetPath, file, fileName);
          count++;
        }
        toast.success(`Added ${count} file${count !== 1 ? "s" : ""} from folder`);
        await refreshTree();
      } catch (err) {
        toast.error("Failed to add folder", { description: String(err) });
      } finally {
        setAddingFiles(false);
        e.target.value = "";
      }
    })();
  };

  const handleDownloadPack = async (folderPath: string, folderName: string) => {
    const vp = fromTempPath(folderPath) ?? folderPath;
    try {
      const files = await listAllFilesUnder(vp);
      if (files.length === 0) {
        toast.error("Folder is empty");
        return;
      }
      const zip = new JSZip();
      const folderPrefix = folderPath.endsWith("/") ? folderPath : `${folderPath}/`;
      for (const { path: filePath, fileName } of files) {
        const fileVp = fromTempPath(filePath) ?? filePath;
        const blob = await getFile(fileVp);
        if (blob) {
          const relativePath = filePath.startsWith(folderPrefix)
            ? filePath.slice(folderPrefix.length)
            : fileName;
          zip.file(relativePath, blob);
        }
      }
      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folderName}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${folderName}.zip`);
    } catch (err) {
      toast.error("Failed to download pack", { description: String(err) });
    }
  };

  const handleDeleteFolder = async (folderPath: string) => {
    const vp = fromTempPath(folderPath) ?? folderPath;
    try {
      await deleteFolder(vp);
      toast.success("Folder cleared");
      setTrashConfirmPath(null);
      await refreshTree();
    } catch (err) {
      toast.error("Failed to clear folder", { description: String(err) });
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    const vp = fromTempPath(filePath) ?? filePath;
    try {
      await deleteFile(vp);
      toast.success("File deleted");
      await refreshTree();
    } catch (err) {
      toast.error("Failed to delete file", { description: String(err) });
    }
  };

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const items = e.dataTransfer?.items;
      if (!items) return;
      const files: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item?.kind === "file") {
          const file = item.getAsFile();
          if (file) files.push(file);
        }
      }
      if (files.length === 0) return;
      setAddingFiles(true);
      try {
        const basePath = addTargetPath === TEMP_FILES_ROOT ? TEMP_FILES_ROOT : addTargetPath;
        let count = 0;
        for (const file of files) {
          const safeName = sanitizeFilenameMinimal(file.name) || "file";
          await putFile(`${basePath}/${safeName}`, file, safeName);
          count++;
        }
        toast.success(`Added ${count} file${count !== 1 ? "s" : ""}`);
        await refreshTree();
      } catch (err) {
        toast.error("Failed to add files", { description: String(err) });
      } finally {
        setAddingFiles(false);
      }
    },
    [addTargetPath, refreshTree],
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
  };

  const renderTreeNode = (node: TempFileNode, depth: number) => {
    const isExpanded = expandedFolders.has(node.id);
    const isSelected = selectedItem === node.id;

    if (node.type === "folder") {
      return (
        <div key={node.id}>
          <div
            data-testid={`tree-node-temp-${node.path.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
            data-expanded={isExpanded ? "true" : "false"}
            className={`flex items-center gap-2 py-1.5 px-2 rounded group transition-colors ${
              isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-secondary/50"
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
          >
            <button
              type="button"
              className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
              onClick={() => {
                setSelectedItem(node.id);
                onSelectionChange?.({ path: node.path, type: "folder", name: node.name });
                void toggleFolder(node);
              }}
            >
              <ChevronRight
                className={`w-4 h-4 shrink-0 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`}
              />
              <Folder className="w-4 h-4 text-primary shrink-0" />
              <span className="text-sm truncate flex-1">{node.name}</span>
            </button>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                void handleDownloadPack(node.path, node.name);
              }}
              aria-label="Download pack"
              title="Download pack as zip"
            >
              <Download className="w-3 h-3" />
            </Button>
            {trashConfirmPath === node.path ? (
              <Button
                size="sm"
                variant="destructive"
                className="h-6 px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  void handleDeleteFolder(node.path);
                }}
              >
                Confirm
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  setTrashConfirmPath(node.path);
                  setTimeout(() => setTrashConfirmPath(null), 3000);
                }}
                aria-label="Clear folder"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
          {isExpanded && node.children && (
            <div>{node.children.map((child) => renderTreeNode(child, depth + 1))}</div>
          )}
          {isExpanded && node.isLoading && (
            <div className="flex items-center gap-2 py-1.5 px-2" style={{ paddingLeft: `${(depth + 1) * 16 + 8}px` }}>
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          )}
        </div>
      );
    }

    return (
      <div
        key={node.id}
        className={`flex items-center gap-2 py-1.5 px-2 rounded group transition-colors ${
          isSelected ? "bg-primary/10 border border-primary/30" : "hover:bg-secondary/50"
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <button
          type="button"
          className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
          onClick={() => {
            setSelectedItem(node.id);
            onSelectionChange?.({ path: node.path, type: "file", name: node.name });
            if (isAudioFile(node.name)) {
              if (previewMode === "multi") {
                putSampleInActiveSlot({ path: node.path, name: node.name, paneType });
                const active = useProjectStore.getState().getActiveStack();
                const slots = active?.slots ?? [];
                const activeSlotIndex = active?.activeSlotIndex ?? 0;
                const sample = slots[activeSlotIndex];
                if (sample) {
                  useWaveformEditorStore
                    .getState()
                    .openWithFileFromMulti(sample.path, sample.name, sample.paneType, sample.id);
                }
              } else {
                useWaveformEditorStore.getState().openWithFile(node.path, node.name, paneType);
              }
            }
          }}
        >
          <span className="w-4" />
          <File className="w-4 h-4 text-muted-foreground shrink-0" />
          <span className="text-sm truncate flex-1">{node.name}</span>
          {node.size != null && (
            <span className="text-xs text-muted-foreground font-mono">{formatFileSize(node.size)}</span>
          )}
          {isAudioFile(node.name) && (
            <TempFilesPlayButton path={node.path} name={node.name} paneType={paneType} />
          )}
        </button>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
          onClick={(e) => {
            e.stopPropagation();
            void handleDeleteFile(node.path);
          }}
          aria-label="Delete file"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    );
  };

  return (
    <div
      className="flex flex-col h-full min-h-0 border border-border rounded-lg bg-card"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="flex items-center gap-2 p-2 border-b border-border shrink-0">
        <div className="flex-1 min-w-0 text-sm font-medium truncate" title={ROOT_PATH}>
          Temp Files
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="audio/*,.wav,.aiff,.aif,.mp3,.flac,.ogg,.m4a,.aac,.wma"
            className="sr-only"
            onChange={handleAddFiles}
          />
          <input
            ref={folderInputRef}
            type="file"
            multiple
            {...{ webkitdirectory: "" }}
            className="sr-only"
            onChange={handleAddFolder}
          />
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            onClick={() => fileInputRef.current?.click()}
            disabled={addingFiles}
          >
            {addingFiles ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
            Add files
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1"
            onClick={() => folderInputRef.current?.click()}
            disabled={addingFiles}
          >
            <FolderInput className="w-3 h-3" />
            Add folder
          </Button>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-0.5">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : fileTree.length > 0 ? (
            fileTree.map((node) => renderTreeNode(node, 0))
          ) : (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No files. Add files or a folder to get started.
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="shrink-0 border-t border-border px-3 py-1.5 text-xs text-muted-foreground flex items-center justify-between">
        <span>{title}</span>
        <span>{formatFileSize(totalBytes)} used</span>
      </div>
    </div>
  );
}

function findNodeById(nodes: TempFileNode[], id: string): TempFileNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNodeById(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function findNodeByPath(nodes: TempFileNode[], path: string): TempFileNode | null {
  for (const n of nodes) {
    if (n.path === path) return n;
    if (n.children) {
      const found = findNodeByPath(n.children, path);
      if (found) return found;
    }
  }
  return null;
}

function updateNodeInTree(
  nodes: TempFileNode[],
  nodeId: string,
  updater: (n: TempFileNode) => TempFileNode,
): TempFileNode[] {
  return nodes.map((n) => {
    if (n.id === nodeId) return updater(n);
    if (n.children) return { ...n, children: updateNodeInTree(n.children, nodeId, updater) };
    return n;
  });
}
