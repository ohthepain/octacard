import { useState, useEffect } from "react";
import { Folder, File, ChevronRight, ChevronDown, Search, HardDrive, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";

interface FileNode {
  id: string;
  name: string;
  type: "file" | "folder";
  path: string;
  children?: FileNode[];
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

interface FileBrowserProps {
  onFileTransfer: (sourcePath: string, destinationPath: string) => void;
  sampleRate: string;
  sampleDepth: string;
  mono: boolean;
  normalize: boolean;
}

export const FileBrowser = ({ onFileTransfer, sampleRate, sampleDepth, mono, normalize }: FileBrowserProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [rootPath, setRootPath] = useState<string>("");
  const [currentRootPath, setCurrentRootPath] = useState<string>("");
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [isDraggingOverRoot, setIsDraggingOverRoot] = useState(false);

  useEffect(() => {
    // Get home directory and load it
    const loadRootDirectory = async () => {
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
        console.log("Home directory result:", homeResult);
        if (homeResult.success && homeResult.data) {
          setRootPath(homeResult.data);
          setCurrentRootPath(homeResult.data);
          await loadDirectory(homeResult.data, "root");
        } else {
          console.error("Failed to get home directory");
        }
      } catch (error) {
        console.error("Failed to load root directory:", error);
      } finally {
        setLoading(false);
      }
    };

    loadRootDirectory();
  }, []);

  const loadDirectory = async (dirPath: string, nodeId: string) => {
    if (!window.electron) return;

    try {
      console.log("Loading directory:", dirPath);
      const result = await window.electron.fs.readDirectory(dirPath);
      console.log("Directory read result:", result);
      if (result.success && result.data) {
        // Filter out hidden files/folders (starting with '.' or '~')
        const filteredEntries = result.data.filter(
          (entry) => !entry.name.startsWith(".") && !entry.name.startsWith("~")
        );

        const children: FileNode[] = filteredEntries.map((entry) => ({
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

        setFileTree((prev) => {
          const updateNode = (nodes: FileNode[]): FileNode[] => {
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

          if (nodeId === "root") {
            return children.map((child) => ({ ...child, id: `root-${child.path}` }));
          }
          return updateNode(prev);
        });
      } else {
        console.error("Failed to read directory:", result.error);
      }
    } catch (error) {
      console.error("Failed to load directory:", error);
    }
  };

  const toggleFolder = async (node: FileNode) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(node.id)) {
      newExpanded.delete(node.id);
    } else {
      newExpanded.add(node.id);
      // Load directory if not already loaded
      if (!node.loaded && node.type === "folder") {
        setFileTree((prev) => {
          const updateNode = (nodes: FileNode[]): FileNode[] => {
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

  const navigateToFolder = async (folderPath: string) => {
    setCurrentRootPath(folderPath);
    setExpandedFolders(new Set());
    setFileTree([]);
    await loadDirectory(folderPath, "root");
  };

  const navigateToParent = async () => {
    if (!currentRootPath || currentRootPath === rootPath) return;

    const parts = currentRootPath.split("/").filter(Boolean);
    if (parts.length <= 1) return; // Already at root

    const parentPath = currentRootPath.startsWith("/")
      ? "/" + parts.slice(0, -1).join("/")
      : parts.slice(0, -1).join("/");
    await navigateToFolder(parentPath);
  };

  const handleDragStart = (e: React.DragEvent, node: FileNode) => {
    e.dataTransfer.setData("sourcePath", node.path);
    e.dataTransfer.setData("sourceType", node.type);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragOver = (e: React.DragEvent, node?: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (node && node.type === "folder") {
      setDragOverPath(node.path);
      setIsDraggingOverRoot(false);
    }
  };

  const handleContainerDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    // Clear any folder drag state when dragging over empty space
    if (dragOverPath) {
      setDragOverPath(null);
    }
    setIsDraggingOverRoot(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only clear if we're actually leaving the element (not just moving to child)
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setDragOverPath(null);
    }
  };

  const handleContainerDragLeave = (e: React.DragEvent) => {
    // Check if we're actually leaving the container
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX;
    const y = e.clientY;
    if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
      setIsDraggingOverRoot(false);
      setDragOverPath(null);
    }
  };

  const handleDrop = async (e: React.DragEvent, destinationNode?: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    setIsDraggingOverRoot(false);

    // Determine destination path
    let destinationPath: string;
    if (destinationNode && destinationNode.type === "folder") {
      destinationPath = destinationNode.path;
    } else {
      // Drop on empty space - use current root path
      destinationPath = currentRootPath || rootPath;
    }

    if (!destinationPath) {
      console.error("No destination path available");
      return;
    }

    const sourcePath = e.dataTransfer.getData("sourcePath");
    const sourceType = e.dataTransfer.getData("sourceType");

    if (!sourcePath || !sourceType) {
      console.error("No source path or type in drag data");
      return;
    }

    if (!window.electron) {
      console.error("Electron API not available");
      return;
    }

    try {
      // Simple path join utility
      const joinPath = (...parts: string[]): string => {
        if (parts.length === 0) return "";
        const normalized = parts.filter(Boolean).map((p) => p.replace(/\\/g, "/"));
        let result = normalized[0];
        for (let i = 1; i < normalized.length; i++) {
          if (!result.endsWith("/")) result += "/";
          result += normalized[i].replace(/^\//, "");
        }
        return result.replace(/\/+/g, "/");
      };

      const basename = (path: string): string => {
        const parts = path.split("/").filter(Boolean);
        return parts[parts.length - 1] || path;
      };

      const fileName = basename(sourcePath);
      const destFilePath = joinPath(destinationPath, fileName);

      if (sourceType === "file") {
        // When files are dragged within FileBrowser (left pane), don't convert
        // Conversion only happens when moving files from left (FileBrowser) to right (CFCardView)
        // So we just copy the file without conversion
        const result = await window.electron.fs.copyFile(sourcePath, destFilePath);

        if (result.success) {
          // Refresh the destination folder
          const nodeId = destinationNode ? destinationNode.id : "root";
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
          const nodeId = destinationNode ? destinationNode.id : "root";
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
  };

  const filterNodes = (nodes: FileNode[], query: string): FileNode[] => {
    if (!query) return nodes;

    return nodes.reduce<FileNode[]>((acc, node) => {
      const matches = node.name.toLowerCase().includes(query.toLowerCase());
      const filteredChildren = node.children ? filterNodes(node.children, query) : [];

      if (matches || filteredChildren.length > 0) {
        acc.push({
          ...node,
          children: filteredChildren.length > 0 ? filteredChildren : node.children,
        });
      }

      return acc;
    }, []);
  };

  const renderFileTree = (nodes: FileNode[], depth: number = 0): React.ReactNode => {
    // Add ".." entry if not at root
    const showParentLink = currentRootPath && currentRootPath !== rootPath;
    const itemsToRender =
      showParentLink && depth === 0
        ? [
            {
              id: "parent-link",
              name: "..",
              type: "folder" as const,
              path: (() => {
                const parts = currentRootPath.split("/").filter(Boolean);
                return currentRootPath.startsWith("/")
                  ? "/" + parts.slice(0, -1).join("/")
                  : parts.slice(0, -1).join("/") || "/";
              })(),
              loaded: false,
            },
            ...nodes,
          ]
        : nodes;

    return itemsToRender.map((node) => {
      const isExpanded = expandedFolders.has(node.id);
      const hasChildren = node.children && node.children.length > 0;
      const isDragOver = dragOverPath === node.path;
      const isParentLink = node.id === "parent-link";

      const handleRevealInFinder = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.electron || isParentLink) return;

        try {
          const result = await window.electron.fs.revealInFinder(node.path);
          if (!result.success) {
            console.error("Failed to reveal in finder:", result.error);
          }
        } catch (error) {
          console.error("Error revealing in finder:", error);
        }
      };

      return (
        <div key={node.id}>
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <div
                draggable={!isParentLink && (node.type === "file" || node.type === "folder")}
                onDragStart={(e) => !isParentLink && handleDragStart(e, node)}
                onDragOver={(e) => {
                  if (!isParentLink && node.type === "folder") {
                    handleDragOver(e, node);
                  }
                }}
                onDragLeave={(e) => {
                  e.stopPropagation();
                  handleDragLeave(e);
                }}
                onDrop={(e) => {
                  if (!isParentLink && node.type === "folder") {
                    handleDrop(e, node);
                  }
                }}
                className={`flex items-center gap-2 py-1.5 px-2 rounded group transition-colors ${
                  node.type === "folder" ? "cursor-pointer" : ""
                } ${
                  isDragOver && node.type === "folder" && !isParentLink
                    ? "bg-primary/20 border border-primary"
                    : "hover:bg-secondary/50"
                }`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={() => {
                  if (isParentLink) {
                    navigateToParent();
                  } else if (node.type === "folder") {
                    toggleFolder(node);
                  }
                }}
                onDoubleClick={() => {
                  if (!isParentLink && node.type === "folder") {
                    navigateToFolder(node.path);
                  }
                }}
              >
                {node.type === "folder" ? (
                  <>
                    <span className="w-4 h-4 flex items-center justify-center">
                      {isParentLink ? null : node.isLoading ? (
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
                    <Folder
                      className={`w-4 h-4 flex-shrink-0 ${isParentLink ? "text-muted-foreground" : "text-primary"}`}
                    />
                  </>
                ) : (
                  <>
                    <span className="w-4" />
                    <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  </>
                )}
                <span className={`text-sm truncate flex-1 ${isParentLink ? "text-muted-foreground italic" : ""}`}>
                  {node.name}
                </span>
                {node.size && (
                  <span className="text-xs text-muted-foreground font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                    {node.size}
                  </span>
                )}
              </div>
            </ContextMenuTrigger>
            {!isParentLink && (
              <ContextMenuContent>
                <ContextMenuItem onClick={handleRevealInFinder}>Reveal in Finder</ContextMenuItem>
              </ContextMenuContent>
            )}
          </ContextMenu>
          {node.type === "folder" && isExpanded && hasChildren && (
            <div>{renderFileTree(node.children!, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  const filteredFileSystem = filterNodes(fileTree, searchQuery);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Local Files</h2>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* File Tree */}
      <ScrollArea className="flex-1">
        <div
          className={`p-2 h-full min-h-full ${isDraggingOverRoot ? "bg-primary/5" : ""}`}
          onDragOver={handleContainerDragOver}
          onDragLeave={handleContainerDragLeave}
          onDrop={(e) => {
            // Only handle drop on empty space if we're not dropping on a folder
            // The folder's drop handler will stop propagation if it handles the drop
            if (!dragOverPath) {
              e.stopPropagation();
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
          ) : filteredFileSystem.length === 0 ? (
            <div
              className={`text-center py-8 text-sm border-2 border-dashed rounded-lg transition-colors ${
                isDraggingOverRoot ? "border-primary bg-primary/10" : "border-muted text-muted-foreground"
              }`}
            >
              {currentRootPath ? (
                <div>
                  <div>Directory: {currentRootPath}</div>
                  <div className="text-xs mt-2 text-muted-foreground">Drop files here to copy</div>
                </div>
              ) : (
                "Drop files here to copy"
              )}
            </div>
          ) : (
            renderFileTree(filteredFileSystem)
          )}
        </div>
      </ScrollArea>

      {/* Status */}
      <div className="h-8 bg-toolbar border-t border-border px-4 flex items-center text-xs text-muted-foreground">
        <span className="font-mono">Drag files or folders to copy ↔</span>
      </div>
    </div>
  );
};
