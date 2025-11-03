import { useState, useEffect, useCallback, useRef } from "react";
import { Folder, File, ChevronRight, ChevronDown, Trash2, FolderPlus, Loader2, XCircle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";

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
  sampleRate: string;
  mono: boolean;
  normalize: boolean;
}

export const CFCardView = ({ onFileTransfer, sampleRate, mono, normalize }: CFCardViewProps) => {
  const [cfStructure, setCFStructure] = useState<CFNode[]>([]);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [cfCardPath, setCfCardPath] = useState<string>("");
  const [currentRootPath, setCurrentRootPath] = useState<string>("");
  const [isDraggingOverRoot, setIsDraggingOverRoot] = useState(false);
  const [isCardMounted, setIsCardMounted] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const currentRootPathRef = useRef<string>("");
  const cfCardPathRef = useRef<string>("");

  // Keep refs in sync with state
  useEffect(() => {
    currentRootPathRef.current = currentRootPath;
  }, [currentRootPath]);

  useEffect(() => {
    cfCardPathRef.current = cfCardPath;
  }, [cfCardPath]);

  const loadDirectory = useCallback(async (dirPath: string, nodeId: string) => {
    if (!window.electron) return;

    try {
      console.log("CF Card - Loading directory:", dirPath);
      // Try to read directory, if it fails, it might not exist yet
      const result = await window.electron.fs.readDirectory(dirPath);
      console.log("CF Card - Directory read result:", result);
      if (result.success && result.data) {
        // Filter out hidden files/folders (starting with '.' or '~')
        const filteredEntries = result.data.filter(
          (entry) => !entry.name.startsWith(".") && !entry.name.startsWith("~")
        );

        const children: CFNode[] = filteredEntries.map((entry) => ({
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
            setCurrentRootPath(parentPath);
            currentRootPathRef.current = parentPath;
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
        // Check for existing SD/CF cards first
        const cardsResult = await window.electron.fs.getSDCFCards();
        if (cardsResult.success && cardsResult.data && cardsResult.data.length > 0) {
          // Navigate to the first detected card
          console.log("SD/CF card already mounted:", cardsResult.data[0]);
          const cardPath = cardsResult.data[0];
          setCfCardPath(cardPath);
          setCurrentRootPath(cardPath);
          setIsCardMounted(true);
          cfCardPathRef.current = cardPath;
          currentRootPathRef.current = cardPath;
          await loadDirectory(cardPath, "cf-root");
          setLoading(false);
          return;
        }

        // Fallback to same folder as left pane (home directory) if no card detected
        const homeResult = await window.electron.fs.getHomeDirectory();
        console.log("CF Card - Home directory result:", homeResult);
        if (homeResult.success && homeResult.data) {
          // Use home directory as the default destination (same as left pane)
          const homePath = homeResult.data;
          setCfCardPath(homePath);
          setCurrentRootPath(homePath);
          setIsCardMounted(false);
          cfCardPathRef.current = homePath;
          currentRootPathRef.current = homePath;
          await loadDirectory(homePath, "cf-root");
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

    // Listen for SD card detection events
    if (window.electron?.on) {
      const handleCardDetected = (cardPath: string) => {
        console.log("SD/CF card detected, navigating to:", cardPath);
        setCfCardPath(cardPath);
        setCurrentRootPath(cardPath);
        setIsCardMounted(true);
        cfCardPathRef.current = cardPath;
        currentRootPathRef.current = cardPath;
        setExpandedFolders(new Set());
        setCFStructure([]);
        loadDirectory(cardPath, "cf-root");
      };

      const handleCardRemoved = async (cardPath: string) => {
        console.log("SD/CF card removed:", cardPath);
        // Check if we need to navigate away using refs
        if (cfCardPathRef.current === cardPath || currentRootPathRef.current === cardPath) {
          try {
            const homeResult = await window.electron?.fs.getHomeDirectory();
            if (homeResult?.success && homeResult.data) {
              // Fallback to home directory (same as left pane)
              const homePath = homeResult.data;
              setCfCardPath(homePath);
              setCurrentRootPath(homePath);
              setIsCardMounted(false);
              cfCardPathRef.current = homePath;
              currentRootPathRef.current = homePath;
              setExpandedFolders(new Set());
              setCFStructure([]);
              await loadDirectory(homePath, "cf-root");
            }
          } catch (error) {
            console.error("Error handling card removal:", error);
          }
        }
      };

      window.electron.on.sdCardDetected(handleCardDetected);
      window.electron.on.sdCardRemoved(handleCardRemoved);

      // Cleanup listeners on unmount
      return () => {
        if (window.electron?.removeListener) {
          window.electron.removeListener("sd-card-detected");
          window.electron.removeListener("sd-card-removed");
        }
      };
    }
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

  const navigateToFolder = async (folderPath: string) => {
    setCurrentRootPath(folderPath);
    currentRootPathRef.current = folderPath;
    setExpandedFolders(new Set());
    setCFStructure([]);
    await loadDirectory(folderPath, "cf-root");
  };

  const navigateToParent = async () => {
    if (!currentRootPath || currentRootPath === cfCardPath) return;

    const parts = currentRootPath.split("/").filter(Boolean);
    if (parts.length <= 1) return; // Already at root

    const parentPath = currentRootPath.startsWith("/")
      ? "/" + parts.slice(0, -1).join("/")
      : parts.slice(0, -1).join("/");
    await navigateToFolder(parentPath);
  };

  const handleDragStart = (e: React.DragEvent, node: CFNode) => {
    e.dataTransfer.setData("sourcePath", node.path);
    e.dataTransfer.setData("sourceType", node.type);
    e.dataTransfer.effectAllowed = "copy";
  };

  const handleDragOver = (e: React.DragEvent, node?: CFNode) => {
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

  const handleDrop = async (e: React.DragEvent, destinationNode?: CFNode) => {
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
      destinationPath = currentRootPath || cfCardPath;
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
      const fileName = basename(sourcePath);
      const destFilePath = joinPath(destinationPath, fileName);

      if (sourceType === "file") {
        // Check if file needs conversion (audio file and sample rate setting is not "dont-change")
        const needsConversion =
          sampleRate !== "dont-change" && /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac)$/i.test(sourcePath);

        let result;
        if (needsConversion) {
          result = await window.electron.fs.convertAndCopyFile(
            sourcePath,
            destFilePath,
            sampleRate === "44.1" ? 44100 : undefined,
            mono,
            normalize
          );
        } else {
          result = await window.electron.fs.copyFile(sourcePath, destFilePath);
        }

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
  };

  const handleDelete = async (node: CFNode) => {
    if (!window.electron) return;

    const itemType = node.type === "file" ? "file" : "folder";
    const confirmMessage = `Are you sure you want to delete ${itemType} "${node.name}"?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      let result;
      if (node.type === "file") {
        result = await window.electron.fs.deleteFile(node.path);
      } else {
        result = await window.electron.fs.deleteFolder(node.path);
      }

      if (result.success) {
        // Find parent directory to refresh
        const parentPath = node.path.split("/").slice(0, -1).join("/");
        if (parentPath) {
          // Find the parent node ID
          const findParentNodeId = (nodes: CFNode[], targetPath: string): string | null => {
            for (const n of nodes) {
              if (n.path === targetPath) {
                return n.id;
              }
              if (n.children) {
                const found = findParentNodeId(n.children, targetPath);
                if (found) return found;
              }
            }
            return null;
          };

          const parentNodeId = findParentNodeId(cfStructure, parentPath) || "cf-root";
          await loadDirectory(parentPath, parentNodeId);
        } else {
          // If it's the root, reload the root
          await loadDirectory(cfCardPath, "cf-root");
        }
      } else {
        console.error(`Failed to delete ${itemType}:`, result.error);
        alert(`Failed to delete ${itemType}: ${result.error}`);
      }
    } catch (error) {
      console.error(`Error deleting ${itemType}:`, error);
      alert(`Error deleting ${itemType}: ${error}`);
    }
  };

  const handleEject = async () => {
    if (!isCardMounted || !window.electron) return;

    try {
      // Navigate back to home directory (same as left pane)
      const homeResult = await window.electron.fs.getHomeDirectory();
      if (homeResult?.success && homeResult.data) {
        const homePath = homeResult.data;
        setCfCardPath(homePath);
        setCurrentRootPath(homePath);
        setIsCardMounted(false);
        cfCardPathRef.current = homePath;
        currentRootPathRef.current = homePath;
        setExpandedFolders(new Set());
        setCFStructure([]);
        await loadDirectory(homePath, "cf-root");
      }
    } catch (error) {
      console.error("Error ejecting card:", error);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !window.electron) return;

    try {
      const folderPath = joinPath(currentRootPath || cfCardPath, newFolderName.trim());
      const result = await window.electron.fs.createFolder(folderPath);

      if (result.success) {
        // Refresh the current directory
        await loadDirectory(currentRootPath || cfCardPath, "cf-root");
        setNewFolderDialogOpen(false);
        setNewFolderName("");
      } else {
        console.error("Failed to create folder:", result.error);
        alert(`Failed to create folder: ${result.error}`);
      }
    } catch (error) {
      console.error("Error creating folder:", error);
      alert(`Error creating folder: ${error}`);
    }
  };

  const renderCFTree = (nodes: CFNode[], depth: number = 0): React.ReactNode => {
    // Add ".." entry if not at root
    const showParentLink = currentRootPath && currentRootPath !== cfCardPath;
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
                {node.size && <span className="text-xs text-muted-foreground font-mono">{node.size}</span>}
                {(node.type === "file" || node.type === "folder") && !isParentLink && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 hover:bg-destructive/20 hover:text-destructive"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(node);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </ContextMenuTrigger>
            {!isParentLink && (
              <ContextMenuContent>
                <ContextMenuItem onClick={handleRevealInFinder}>Reveal in Finder</ContextMenuItem>
              </ContextMenuContent>
            )}
          </ContextMenu>
          {node.type === "folder" && isExpanded && hasChildren && <div>{renderCFTree(node.children!, depth + 1)}</div>}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">CF Card Structure</h2>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0"
            onClick={handleEject}
            disabled={!isCardMounted}
            title={isCardMounted ? "Eject card" : "No card mounted"}
          >
            <XCircle
              className={`w-4 h-4 ${
                isCardMounted ? "text-muted-foreground hover:text-foreground" : "text-muted-foreground/50"
              }`}
            />
          </Button>
        </div>
        <Button size="sm" variant="secondary" className="gap-2" onClick={() => setNewFolderDialogOpen(true)}>
          <FolderPlus className="w-4 h-4" />
          New Folder
        </Button>
      </div>

      {/* CF Tree */}
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

      {/* New Folder Dialog */}
      <Dialog
        open={newFolderDialogOpen}
        onOpenChange={(open) => {
          setNewFolderDialogOpen(open);
          if (!open) {
            setNewFolderName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>Enter a name for the new folder.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="folder-name">Folder Name</Label>
              <Input
                id="folder-name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleCreateFolder();
                  }
                }}
                placeholder="My New Folder"
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setNewFolderDialogOpen(false);
                setNewFolderName("");
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
