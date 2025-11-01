import { useState, useEffect, useCallback } from "react";
import { Folder, File, ChevronRight, ChevronDown, Trash2, FolderPlus, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

// Simple path join utility for cross-platform compatibility
function joinPath(...parts: string[]): string {
  if (parts.length === 0) return "";
  const normalized = parts.filter(Boolean).map((p) => p.replace(/\\/g, "/"));
  let result = normalized[0];
  for (let i = 1; i < normalized.length; i++) {
    if (!result.endsWith("/")) result += "/";
    result += normalized[i].replace(/^\//, "");
  }
  return result.replace(/\/+/g, "/");
}

function basename(path: string): string {
  const parts = path.split("/").filter(Boolean);
  return parts[parts.length - 1] || path;
}

interface CFNode {
  id: string;
  name: string;
  type: "file" | "folder";
  path: string;
  children?: CFNode[];
  size?: string;
  format?: string;
  isLoading?: boolean;
  loaded?: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface CFCardViewProps {
  onFileTransfer: (sourcePath: string, destinationPath: string) => void;
}

export const CFCardView = ({ onFileTransfer }: CFCardViewProps) => {
  const [cfStructure, setCFStructure] = useState<CFNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cfCardPath, setCfCardPath] = useState<string>("");
  const [isDraggingOverRoot, setIsDraggingOverRoot] = useState(false);

  const loadDirectory = useCallback(async (dirPath: string, nodeId: string) => {
    if (!window.electron) return;

    try {
      console.log("CF Card - Loading directory:", dirPath);
      // Try to read directory, if it fails, it might not exist yet
      const result = await window.electron.fs.readDirectory(dirPath);
      console.log("CF Card - Directory read result:", result);
      if (result.success && result.data) {
        const children: CFNode[] = result.data.map((entry) => ({
          id: `${nodeId}-${entry.path}`,
          name: entry.name,
          type: entry.type,
          path: entry.path,
          size: entry.type === "file" ? formatFileSize(entry.size) : undefined,
          loaded: false,
        }));

        // Sort: folders first, then files, both alphabetically
        children.sort((a, b) => {
          if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1;
          }
          return a.name.localeCompare(b.name);
        });

        setCFStructure((prev) => {
          const updateNode = (nodes: CFNode[]): CFNode[] => {
            return nodes.map((node) => {
              if (node.id === nodeId) {
                return { ...node, children, loaded: true, isLoading: false };
              }
              if (node.children) {
                return { ...node, children: updateNode(node.children) };
              }
              return node;
            });
          };

          if (nodeId === "cf-root") {
            return children.map((child) => ({ ...child, id: `cf-root-${child.path}` }));
          }
          return updateNode(prev);
        });
      } else if (result.error && result.error.includes("ENOENT")) {
        // Directory doesn't exist, try loading parent directory (Documents)
        if (nodeId === "cf-root") {
          const parentPath = dirPath.split("/").slice(0, -1).join("/");
          if (parentPath) {
            console.log("CF_Card doesn't exist, trying parent:", parentPath);
            await loadDirectory(parentPath, "cf-root");
          } else {
            // Fallback to empty array
            setCFStructure([]);
          }
        } else {
          setCFStructure((prev) => {
            if (nodeId === "cf-root") {
              return [];
            }
            return prev;
          });
        }
      } else {
        console.error("Failed to read directory:", result.error);
      }
    } catch (error) {
      console.error("Failed to load directory:", error);
    }
  }, []);

  useEffect(() => {
    // Initialize CF card directory (show file system starting from Documents/CF_Card)
    const initializeCFCard = async () => {
      // Wait a bit for preload script to load
      let retries = 0;
      while (!window.electron && retries < 10) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        retries++;
      }

      if (!window.electron) {
        console.error("Electron API not available after waiting");
        console.log("window.electron:", window.electron);
        setLoading(false);
        return;
      }

      console.log("Electron API available:", window.electron);

      try {
        const homeResult = await window.electron.fs.getHomeDirectory();
        console.log("CF Card - Home directory result:", homeResult);
        if (homeResult.success && homeResult.data) {
          // Use Documents/CF_Card as the default destination, or Documents if CF_Card doesn't exist
          const documentsPath = joinPath(homeResult.data, "Documents");
          const cfPath = joinPath(documentsPath, "CF_Card");
          setCfCardPath(cfPath);
          // Try to load CF_Card first, fallback to Documents if it doesn't exist
          await loadDirectory(cfPath, "cf-root");
        } else {
          console.error("Failed to get home directory");
        }
      } catch (error) {
        console.error("Failed to initialize CF card:", error);
      } finally {
        setLoading(false);
      }
    };

    initializeCFCard();
  }, [loadDirectory]);

  const toggleFolder = async (node: CFNode) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(node.id)) {
      newExpanded.delete(node.id);
    } else {
      newExpanded.add(node.id);
      // Load directory if not already loaded
      if (!node.loaded && node.type === "folder") {
        setCFStructure((prev) => {
          const updateNode = (nodes: CFNode[]): CFNode[] => {
            return nodes.map((n) => {
              if (n.id === node.id) {
                return { ...n, isLoading: true };
              }
              if (n.children) {
                return { ...n, children: updateNode(n.children) };
              }
              return n;
            });
          };
          return updateNode(prev);
        });
        await loadDirectory(node.path, node.id);
      }
    }
    setExpandedFolders(newExpanded);
  };

  const handleDragOver = (e: React.DragEvent, node: CFNode) => {
    e.preventDefault();
    e.stopPropagation();
    if (node.type === "folder") {
      setDragOverPath(node.path);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
  };

  const handleDrop = async (e: React.DragEvent, destinationNode?: CFNode) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    setIsDraggingOverRoot(false);

    const destinationPath = destinationNode ? destinationNode.path : cfCardPath;
    if (!destinationPath || (destinationNode && destinationNode.type !== "folder")) return;

    const sourcePath = e.dataTransfer.getData("sourcePath");
    const sourceType = e.dataTransfer.getData("sourceType");

    if (sourcePath && destinationPath && window.electron) {
      try {
        const fileName = basename(sourcePath);
        const destFilePath = joinPath(destinationPath, fileName);

        if (sourceType === "file") {
          const result = await window.electron.fs.copyFile(sourcePath, destFilePath);
          if (result.success) {
            // Refresh the destination folder
            const nodeId = destinationNode ? destinationNode.id : "cf-root";
            await loadDirectory(destinationPath, nodeId);
            onFileTransfer(sourcePath, destinationPath);
          } else {
            console.error("Failed to copy file:", result.error);
            alert(`Failed to copy file: ${result.error}`);
          }
        } else if (sourceType === "folder") {
          const result = await window.electron.fs.copyFolder(sourcePath, destFilePath);
          if (result.success) {
            // Refresh the destination folder
            const nodeId = destinationNode ? destinationNode.id : "cf-root";
            await loadDirectory(destinationPath, nodeId);
            onFileTransfer(sourcePath, destinationPath);
          } else {
            console.error("Failed to copy folder:", result.error);
            alert(`Failed to copy folder: ${result.error}`);
          }
        }
      } catch (error) {
        console.error("Error copying file/folder:", error);
        alert(`Error copying: ${error}`);
      }
    }
  };

  const renderCFTree = (nodes: CFNode[], depth: number = 0): React.ReactNode => {
    return nodes.map((node) => {
      const isExpanded = expandedFolders.has(node.id);
      const hasChildren = node.children && node.children.length > 0;
      const isDragOver = dragOverPath === node.path;

      return (
        <div key={node.id}>
          <div
            onDragOver={(e) => handleDragOver(e, node)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, node)}
            className={`flex items-center gap-2 py-1.5 px-2 rounded group transition-colors ${
              node.type === "folder" ? "cursor-pointer" : ""
            } ${
              isDragOver && node.type === "folder" ? "bg-primary/20 border border-primary" : "hover:bg-secondary/50"
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => node.type === "folder" && toggleFolder(node)}
          >
            {node.type === "folder" ? (
              <>
                <span className="w-4 h-4 flex items-center justify-center">
                  {node.isLoading ? (
                    <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />
                  ) : (
                    (hasChildren || !node.loaded) &&
                    (isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    ))
                  )}
                </span>
                <Folder className="w-4 h-4 text-primary flex-shrink-0" />
              </>
            ) : (
              <>
                <span className="w-4" />
                <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </>
            )}
            <span className="text-sm truncate flex-1">{node.name}</span>
            {node.size && <span className="text-xs text-muted-foreground font-mono">{node.size}</span>}
            {node.type === "file" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  console.log("Delete file:", node.path);
                }}
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
          </div>
          {node.type === "folder" && isExpanded && hasChildren && <div>{renderCFTree(node.children!, depth + 1)}</div>}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">CF Card Structure</h2>
        <Button size="sm" variant="secondary" className="gap-2">
          <FolderPlus className="w-4 h-4" />
          New Folder
        </Button>
      </div>

      {/* CF Tree */}
      <ScrollArea className="flex-1">
        <div
          className="p-2 h-full"
          onDragOver={(e) => {
            if (cfStructure.length === 0) {
              e.preventDefault();
              setIsDraggingOverRoot(true);
            }
          }}
          onDragLeave={(e) => {
            if (cfStructure.length === 0) {
              setIsDraggingOverRoot(false);
            }
          }}
          onDrop={(e) => {
            if (cfStructure.length === 0) {
              handleDrop(e);
            }
          }}
        >
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !window.electron ? (
            <div className="text-center py-8 text-sm text-red-500">
              Electron API not available. Please run in Electron environment.
            </div>
          ) : cfStructure.length === 0 ? (
            <div
              className={`text-center py-8 text-sm border-2 border-dashed rounded-lg transition-colors ${
                isDraggingOverRoot ? "border-primary bg-primary/10" : "border-muted text-muted-foreground"
              }`}
            >
              {cfCardPath ? (
                <div>
                  <div>CF Card directory: {cfCardPath}</div>
                  <div className="text-xs mt-2 text-muted-foreground">
                    Directory doesn't exist yet. Drop files here to create it.
                  </div>
                </div>
              ) : (
                "Drop files here to copy"
              )}
            </div>
          ) : (
            renderCFTree(cfStructure)
          )}
        </div>
      </ScrollArea>

      {/* Status */}
      <div className="h-8 bg-toolbar border-t border-border px-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono">Drop files here to copy</span>
        <span>CF Card: 4.2 GB free</span>
      </div>
    </div>
  );
};
