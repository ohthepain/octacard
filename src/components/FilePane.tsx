import { useState, useEffect, useCallback, useRef } from "react";
import {
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  Check,
  Search,
  Trash2,
  FolderPlus,
  FolderOpen,
  Loader2,
  XCircle,
  ArrowUp,
  RotateCw,
  Star,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Progress } from "@/components/ui/progress";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useNavigationState } from "@/hooks/use-navigation-state";
import { useFavorites } from "@/hooks/use-favorites";
import { AudioPreview } from "@/components/AudioPreview";
import { VideoPreview } from "@/components/VideoPreview";
import { ConversionConfirmDialog } from "@/components/ConversionConfirmDialog";
import { fileSystemService } from "@/lib/fileSystem";

// Registry to track active pane and clear selections in other panes
const paneRegistry = new Map<string, () => void>();

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

function dirname(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return filePath.startsWith("/") ? "/" : "";
  }
  const parentParts = parts.slice(0, -1);
  return filePath.startsWith("/") ? "/" + parentParts.join("/") : parentParts.join("/");
}

function isAudioFile(fileName: string): boolean {
  return /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i.test(fileName);
}

function isVideoFile(fileName: string): boolean {
  return /\.(mp4|mov|avi|mkv|webm|m4v|flv|wmv|3gp|ogv)$/i.test(fileName);
}

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
  birthtime?: number; // Date Created (timestamp)
  mtime?: number; // Date Modified (timestamp)
  atime?: number; // Date Last Opened (timestamp)
}

interface VolumeOption {
  path: string;
  uuid: string | null;
  name: string;
  isRemovable: boolean;
  isHome: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface FilePaneProps {
  paneName: string;
  title?: string;
  onFileTransfer?: (sourcePath: string, destinationPath: string) => void;
  sampleRate?: string;
  sampleDepth?: string;
  fileFormat?: string;
  mono?: boolean;
  normalize?: boolean;
  trimStart?: boolean;
  autoNavigateToCard?: boolean;
  convertFiles?: boolean;
  showEjectButton?: boolean;
  showNewFolderButton?: boolean;
  /** When false, hide the left sidebar (Directory + Favorites). Use when pane is inside a layout with external favorites columns. */
  showSidebar?: boolean;
  /** Called when current path or volume changes - for syncing with external favorites columns */
  onPathChange?: (path: string, volumeId: string) => void;
  /** When true, dropping a folder navigates to it instead of converting */
  dropMode?: "navigate" | "convert";
  /** When set, navigate to this path (e.g. from favorites column). Parent should clear via onRequestedPathHandled. */
  requestedPath?: string | null;
  onRequestedPathHandled?: () => void;
  /** When set, reveal this folder in its parent listing and expand/select it. */
  requestedRevealPath?: string | null;
  onRequestedRevealPathHandled?: () => void;
  /** When provided, enables "Browse for folder" to open a folder picker and navigate to the selected folder. Receives current path so picker can start there. */
  onBrowseForFolder?: (currentPath?: string) => void;
}

export const FilePane = ({
  paneName,
  title = "Files",
  onFileTransfer,
  sampleRate = "dont-change",
  sampleDepth = "dont-change",
  fileFormat = "dont-change",
  mono = false,
  normalize = false,
  trimStart = false,
  autoNavigateToCard = false,
  convertFiles = false,
  showEjectButton = false,
  showNewFolderButton = false,
  showSidebar = true,
  onPathChange,
  dropMode = "convert",
  requestedPath,
  onRequestedPathHandled,
  requestedRevealPath,
  onRequestedRevealPathHandled,
  onBrowseForFolder,
}: FilePaneProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSearchingFolders, setIsSearchingFolders] = useState(false);
  const [searchResults, setSearchResults] = useState<
    Array<{ name: string; path: string; type: "file" | "folder"; size: number; isDirectory: boolean }>
  >([]);
  const [rootPath, setRootPath] = useState<string>("");
  const [currentRootPath, setCurrentRootPath] = useState<string>("");
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [isDraggingOverRoot, setIsDraggingOverRoot] = useState(false);
  const [currentVolumeUUID, setCurrentVolumeUUID] = useState<string | null>(null);
  const [pathDoesNotExist, setPathDoesNotExist] = useState(false);
  const [isCardMounted, setIsCardMounted] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedAudioFile, setSelectedAudioFile] = useState<{ path: string; name: string } | null>(null);
  const [selectedVideoFile, setSelectedVideoFile] = useState<{ path: string; name: string } | null>(null);
  const [displayTitle, setDisplayTitle] = useState<string>(title);
  const [availableVolumes, setAvailableVolumes] = useState<VolumeOption[]>([]);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
  const [copyProgress, setCopyProgress] = useState<{
    isVisible: boolean;
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);
  const currentRootPathRef = useRef<string>("");
  const rootPathRef = useRef<string>("");
  const fileTreeRef = useRef<FileNode[]>([]);
  const isSearchLoadingRef = useRef<boolean>(false);
  const searchCancelledRef = useRef<boolean>(false);
  const isSearchingRef = useRef<boolean>(false);
  const currentSearchQueryRef = useRef<string>("");
  const paneContainerRef = useRef<HTMLDivElement>(null);
  const handleDeleteRef = useRef<((node?: FileNode) => Promise<void>) | null>(null);
  const { saveNavigationState, getNavigationState } = useNavigationState(paneName);
  const paneType = (paneName === "dest" ? "dest" : "source") as "source" | "dest";
  const volumeId = currentVolumeUUID ?? "_default";
  const { favorites, addFavorite, removeFavorite, isFavorite } = useFavorites(paneType, volumeId);
  const [pendingExpandedFolders, setPendingExpandedFolders] = useState<string[]>([]);
  const [isRestoringExpanded, setIsRestoringExpanded] = useState(false);
  const [conversionConfirmOpen, setConversionConfirmOpen] = useState(false);
  const [treeViewMode, setTreeViewMode] = useState<"all" | "folders">("all");
  const [pendingConversionItems, setPendingConversionItems] = useState<Array<{
    path: string;
    name: string;
    type: "file" | "folder";
    targetDir: string;
    file?: File;
    handle?: FileSystemDirectoryHandle;
  }> | null>(null);
  const [pendingDestinationPath, setPendingDestinationPath] = useState<string>("");
  const [pendingDestinationNode, setPendingDestinationNode] = useState<FileNode | undefined>(undefined);
  const [sortBy, setSortBy] = useState<"name" | "dateAdded" | "dateCreated" | "dateModified" | "dateLastOpened">(
    "name",
  );

  // Helper function to recursively count files in a folder
  const countFilesRecursively = useCallback(
    async (folderPath: string, sourcePane?: "source" | "dest"): Promise<number> => {
      try {
        const result = await fileSystemService.readDirectory(folderPath, sourcePane ?? paneType);
        if (!result.success || !result.data) return 0;

        let count = 0;
        for (const entry of result.data) {
          if (entry.type === "file") {
            count++;
          } else if (entry.type === "folder") {
            count += await countFilesRecursively(entry.path, sourcePane ?? paneType);
          }
        }
        return count;
      } catch (error) {
        console.error("Error counting files:", error);
        return 0;
      }
    },
    [paneType],
  );

  // Helper function to get all selected nodes from the file tree
  const getSelectedNodes = useCallback(
    (nodes: FileNode[]): FileNode[] => {
      const selected: FileNode[] = [];
      const findNodes = (nodeList: FileNode[]) => {
        for (const node of nodeList) {
          if (selectedItems.has(node.id) && node.id !== "parent-link") {
            selected.push(node);
          }
          if (node.children) {
            findNodes(node.children);
          }
        }
      };
      findNodes(nodes);
      return selected;
    },
    [selectedItems],
  );

  // Helper functions for storing/retrieving last right pane volume UUID
  const getLastRightPaneVolumeUUID = useCallback((): string | null => {
    try {
      const saved = localStorage.getItem("octacard_last_right_pane_volume_uuid");
      return saved || null;
    } catch (error) {
      console.error("Failed to get last right pane volume UUID:", error);
      return null;
    }
  }, []);

  const saveLastRightPaneVolumeUUID = useCallback((volumeUUID: string | null) => {
    try {
      if (volumeUUID) {
        localStorage.setItem("octacard_last_right_pane_volume_uuid", volumeUUID);
      } else {
        localStorage.removeItem("octacard_last_right_pane_volume_uuid");
      }
    } catch (error) {
      console.error("Failed to save last right pane volume UUID:", error);
    }
  }, []);

  // Helper function to get volume name from path
  const getVolumeName = useCallback((volumePath: string): string => {
    if (!volumePath) return "Local Files";
    // Extract volume name from path
    // On macOS: /Volumes/VolumeName -> VolumeName
    // On Linux: /media/username/VolumeName -> VolumeName
    // On Windows: C:\ -> C:
    const parts = volumePath.split("/").filter(Boolean);
    if (parts.length > 0) {
      // For macOS /Volumes/VolumeName, return VolumeName
      if (volumePath.startsWith("/Volumes/") && parts.length >= 2) {
        return parts[1];
      }
      // For Linux /media/username/VolumeName, return VolumeName
      if (volumePath.startsWith("/media/") && parts.length >= 3) {
        return parts[2];
      }
      // For other cases, return the last part
      return parts[parts.length - 1];
    }
    return "Local Files";
  }, []);

  const normalizeVolumePath = useCallback((value: string | null | undefined): string => {
    if (!value) return "";
    return value.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  }, []);

  // Refresh the "available volumes" list.
  // In the web app we cannot enumerate OS volumes, so we treat the
  // user-selected root directory as a single "Local Files" volume.
  const refreshAvailableVolumes = useCallback(async () => {
    try {
      if (!fileSystemService.hasRootForPane(paneType)) {
        setAvailableVolumes([]);
        return;
      }

      const rootName = fileSystemService.getRootDirectoryName(paneType) || "Local Files";
      const volumes: VolumeOption[] = [
        {
          path: "/",
          uuid: null,
          name: rootName,
          isRemovable: false,
          isHome: true,
        },
      ];

      setAvailableVolumes(volumes);
    } catch (error) {
      console.error("Failed to refresh available volumes:", error);
    }
  }, []);

  // Request root directory on mount if not set
  const requestRootDirectory = useCallback(async () => {
    const result = await fileSystemService.requestRootDirectory();
    if (result.success && result.data) {
      setRootPath("/");
      setCurrentRootPath("/");
      setDisplayTitle(fileSystemService.getRootDirectoryName(paneType));
      await refreshAvailableVolumes();
      await loadDirectory("/", "root");
    }
  }, []);

  // Check if root directory is set on mount
  useEffect(() => {
    if (!fileSystemService.hasRootForPane(paneType)) {
      setLoading(false);
      setPathDoesNotExist(true);
    } else {
      setRootPath("/");
      setCurrentRootPath("/");
      setDisplayTitle(fileSystemService.getRootDirectoryName(paneType));
      void refreshAvailableVolumes();
      loadDirectory("/", "root");
    }
  }, []);

  // Keep refs in sync with state
  useEffect(() => {
    currentRootPathRef.current = currentRootPath;
  }, [currentRootPath]);

  useEffect(() => {
    rootPathRef.current = rootPath;
  }, [rootPath]);

  useEffect(() => {
    fileTreeRef.current = fileTree;
  }, [fileTree]);

  useEffect(() => {
    isSearchingRef.current = !!searchQuery;
  }, [searchQuery]);

  // Helper function to get volume UUID for a path (not available in web)
  const getVolumeUUIDForPath = async (_path: string): Promise<string | null> => {
    return null;
  };

  // Find the nearest existing parent folder
  const findNearestExistingParent = useCallback(
    async (dirPath: string): Promise<string | null> => {
      const parts = dirPath.split("/").filter(Boolean);
      if (parts.length === 0) return null;

      // Try each parent directory starting from the immediate parent
      for (let i = parts.length - 1; i > 0; i--) {
        const parentPath = dirPath.startsWith("/") ? "/" + parts.slice(0, i).join("/") : parts.slice(0, i).join("/");

        try {
          const statsResult = await fileSystemService.getFileStats(parentPath, paneType);
          if (statsResult.success && statsResult.data?.isDirectory) {
            return parentPath;
          }
        } catch {
          // Continue to next parent
          continue;
        }
      }

      // If no parent found, try root path
      if (rootPath) {
        try {
          const statsResult = await fileSystemService.getFileStats(rootPath, paneType);
          if (statsResult.success && statsResult.data?.isDirectory) {
            return rootPath;
          }
        } catch {
          // Root path doesn't exist either
        }
      }

      return null;
    },
    [rootPath],
  );

  const loadDirectory = useCallback(
    async (dirPath: string, nodeId: string) => {
      // Check if root directory is set
      if (!fileSystemService.hasRootForPane(paneType)) {
        setLoading(false);
        return;
      }

      // Validate that dirPath is a valid string
      if (!dirPath || typeof dirPath !== "string" || dirPath.trim() === "") {
        console.error("Invalid directory path provided to loadDirectory:", dirPath);
        return;
      }

      try {
        console.log(`${paneName} - Loading directory:`, dirPath);
        const result = await fileSystemService.readDirectory(dirPath, paneType);
        console.log(`${paneName} - Directory read result:`, result);
        if (result.success && result.data) {
          // Directory exists, clear the error state
          setPathDoesNotExist(false);

          // Filter out hidden files/folders (starting with '.' or '~')
          // Note: In web/File System Access API, "/" is the user's selected folder - show all contents.
          // Show all contents in the user-selected folder.
          const filteredEntries = result.data.filter((entry) => {
            if (entry.name.startsWith(".") || entry.name.startsWith("~")) {
              return false;
            }
            return true;
          });

          const children: FileNode[] = filteredEntries.map((entry) => {
            const entryWithDates = entry as typeof entry & { birthtime?: number; mtime?: number; atime?: number };
            return {
              id: `${nodeId}-${entry.path}`,
              name: entry.name,
              type: entry.type,
              path: entry.path,
              size: entry.type === "file" ? formatFileSize(entry.size) : undefined,
              loaded: false,
              birthtime: entryWithDates.birthtime,
              mtime: entryWithDates.mtime,
              atime: entryWithDates.atime,
            };
          });

          // Sort based on selected sort option
          children.sort((a, b) => {
            // Always show folders first
            if (a.type !== b.type) {
              return a.type === "folder" ? -1 : 1;
            }

            // Then sort by selected criteria
            switch (sortBy) {
              case "name":
                return a.name.localeCompare(b.name);
              case "dateAdded":
                // Date Added is typically the same as birthtime (creation date)
                return (b.birthtime || 0) - (a.birthtime || 0);
              case "dateCreated":
                return (b.birthtime || 0) - (a.birthtime || 0);
              case "dateModified":
                return (b.mtime || 0) - (a.mtime || 0);
              case "dateLastOpened":
                return (b.atime || 0) - (a.atime || 0);
              default:
                return a.name.localeCompare(b.name);
            }
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
        } else if (result.error && result.error.includes("ENOENT")) {
          // Directory doesn't exist
          if (nodeId === "root") {
            setPathDoesNotExist(true);
            setFileTree([]);
          }
        } else {
          console.error("Failed to read directory:", result.error);
          if (nodeId === "root") {
            setPathDoesNotExist(true);
            setFileTree([]);
          }
        }
      } catch (error) {
        console.error("Failed to load directory:", error);
        if (nodeId === "root") {
          setPathDoesNotExist(true);
          setFileTree([]);
        }
      }
    },
    [paneName, availableVolumes, sortBy],
  );

  // Re-sort current directory when sort option changes
  useEffect(() => {
    if (fileTree.length === 0 || !currentRootPath) return;

    const sortNodes = (nodes: FileNode[]): FileNode[] => {
      return nodes
        .map((node) => ({
          ...node,
          children: node.children ? sortNodes(node.children) : undefined,
        }))
        .sort((a, b) => {
          // Always show folders first
          if (a.type !== b.type) {
            return a.type === "folder" ? -1 : 1;
          }

          // Then sort by selected criteria
          switch (sortBy) {
            case "name":
              return a.name.localeCompare(b.name);
            case "dateAdded":
              return (b.birthtime || 0) - (a.birthtime || 0);
            case "dateCreated":
              return (b.birthtime || 0) - (a.birthtime || 0);
            case "dateModified":
              return (b.mtime || 0) - (a.mtime || 0);
            case "dateLastOpened":
              return (b.atime || 0) - (a.atime || 0);
            default:
              return a.name.localeCompare(b.name);
          }
        });
    };

    setFileTree((prev) => sortNodes(prev));
  }, [sortBy, currentRootPath]);

  // Effect to restore expanded folders when fileTree is populated
  useEffect(() => {
    // Don't restore expanded folders during search or if already restoring
    // Only run when pendingExpandedFolders changes, not when fileTree changes
    if (
      pendingExpandedFolders.length === 0 ||
      fileTreeRef.current.length === 0 ||
      isRestoringExpanded ||
      isSearchingRef.current ||
      isSearchingFolders
    )
      return;

    let cancelled = false;
    const timeouts: NodeJS.Timeout[] = [];

    const restoreExpandedFolders = async () => {
      setIsRestoringExpanded(true);
      const expandedSet = new Set(pendingExpandedFolders);
      const currentTree = fileTreeRef.current; // Use ref to get latest tree

      // Find and expand nodes recursively
      const processNodes = async (nodesToProcess: FileNode[], parentLoaded: boolean = true): Promise<void> => {
        if (cancelled) return;

        // Wait a bit if parent was just loaded
        if (!parentLoaded) {
          await new Promise<void>((resolve) => {
            const timeout = setTimeout(resolve, 100);
            timeouts.push(timeout);
          });
        }

        if (cancelled) return;

        for (const node of nodesToProcess) {
          if (cancelled) return;

          if (expandedSet.has(node.id) && node.type === "folder") {
            // Mark as expanded
            setExpandedFolders((prev) => {
              const newSet = new Set(prev);
              newSet.add(node.id);
              return newSet;
            });

            // Load directory if not already loaded
            if (!node.loaded) {
              loadDirectory;
              await loadDirectory(node.path, node.id);
              if (cancelled) return;

              // Wait for load to complete
              await new Promise<void>((resolve) => {
                const timeout = setTimeout(resolve, 100);
                timeouts.push(timeout);
              });
            }

            if (cancelled) return;

            // Get updated tree from ref
            const updatedTree = fileTreeRef.current;
            const findNode = (treeNodes: FileNode[], targetId: string): FileNode | null => {
              for (const n of treeNodes) {
                if (n.id === targetId) return n;
                if (n.children) {
                  const found = findNode(n.children, targetId);
                  if (found) return found;
                }
              }
              return null;
            };
            const updatedNode = findNode(updatedTree, node.id);

            // Process children recursively
            if (updatedNode?.children && updatedNode.children.length > 0) {
              await processNodes(updatedNode.children, true);
            }
          }
        }
      };

      await processNodes(currentTree, true);

      if (!cancelled) {
        setPendingExpandedFolders([]);
        setIsRestoringExpanded(false);
      }
    };

    restoreExpandedFolders();

    // Cleanup function
    return () => {
      cancelled = true;
      timeouts.forEach((timeout) => clearTimeout(timeout));
    };
  }, [pendingExpandedFolders, loadDirectory, isRestoringExpanded, isSearchingFolders]); // Added isSearchingFolders to prevent running during search

  // Restore selected items after expanded folders are restored
  useEffect(() => {
    // Only restore if we have paths to restore and expanded folders are done restoring
    if (!selectedPathsToRestoreRef.current || isRestoringExpanded || fileTreeRef.current.length === 0) {
      return;
    }

    // Wait a bit for the tree to stabilize after expansion
    const timeout = setTimeout(() => {
      const restoreSelectedItems = (nodes: FileNode[]) => {
        const restoredIds = new Set<string>();
        const findNodesByPath = (nodeList: FileNode[]) => {
          for (const node of nodeList) {
            if (selectedPathsToRestoreRef.current?.has(node.path)) {
              restoredIds.add(node.id);
            }
            if (node.children) {
              findNodesByPath(node.children);
            }
          }
        };
        findNodesByPath(nodes);

        if (restoredIds.size > 0) {
          setSelectedItems(restoredIds);
          const flatNodes = getFlatNodeList(nodes);
          const firstSelectedId = Array.from(restoredIds)[0];
          const index = flatNodes.findIndex((n) => n.id === firstSelectedId);
          if (index >= 0) {
            setLastSelectedIndex(index);
          }
        }
        // Clear the ref after restoring
        selectedPathsToRestoreRef.current = null;
      };
      restoreSelectedItems(fileTreeRef.current);
    }, 300);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRestoringExpanded]);

  useEffect(() => {
    let cancelled = false;
    const timeouts: NodeJS.Timeout[] = [];

    console.log("useEffect: autoNavigateToCard, paneName:", paneName);

    // Initialize directory (client-only; file system uses File System Access API in browser)
    const initializePane = async () => {
      if (typeof window === "undefined") {
        setLoading(false);
        return;
      }

      if (cancelled) return;

      try {
        if (cancelled) return;

        let initialPath: string;
        let volumeUUID: string | null = null;

        if (autoNavigateToCard) {
          // For right pane: Check saved last volume UUID first, then removable drives, then fallback to home
          const lastRightPaneUUID = getLastRightPaneVolumeUUID();
          console.log(`${paneName} - Last right pane volume UUID:`, lastRightPaneUUID);

          // SD card detection not available in web - skip auto-navigation
          const availableCards: Array<{ path: string; uuid: string }> = [];

          // Try to find the saved last volume UUID in available cards
          let selectedCard: { path: string; uuid: string } | null = null;
          if (lastRightPaneUUID && availableCards.length > 0) {
            const foundCard = availableCards.find((card) => card.uuid === lastRightPaneUUID);
            if (foundCard) {
              selectedCard = foundCard;
              console.log(`${paneName} - Found saved last right pane volume:`, selectedCard);
            }
          }

          // If saved volume not found, use first available removable drive
          if (!selectedCard && availableCards.length > 0) {
            selectedCard = availableCards[0];
            console.log(`${paneName} - Using first available removable drive:`, selectedCard);
          }

          if (selectedCard) {
            // Navigate to the selected card
            const cardPath = selectedCard.path;
            const cardUUID = selectedCard.uuid;
            console.log(`${paneName} - Navigating to removable drive:`, cardPath, "UUID:", cardUUID);

            setRootPath(cardPath);
            setIsCardMounted(true);
            setCurrentVolumeUUID(cardUUID);
            rootPathRef.current = cardPath;
            volumeUUID = cardUUID;
            setDisplayTitle(getVolumeName(cardPath));
            saveLastRightPaneVolumeUUID(cardUUID);
            await refreshAvailableVolumes();

            // Try to restore saved navigation state
            initialPath = cardPath;
            const savedState = getNavigationState(cardUUID);
            console.log(`${paneName} - Checking saved state for card UUID:`, cardUUID, "savedState:", savedState);

            if (savedState && savedState.currentPath) {
              // Verify the saved path still exists, is accessible, AND is on the same volume as the card
              try {
                console.log(`${paneName} - Verifying saved path exists:`, savedState.currentPath);
                const statsResult = await fileSystemService.getFileStats(savedState.currentPath, paneType);
                console.log(`${paneName} - Stats result:`, statsResult);

                if (statsResult.success && statsResult.data?.isDirectory) {
                  // Verify the saved path is on the same volume as the card
                  const savedPathVolumeUUID = await getVolumeUUIDForPath(savedState.currentPath);
                  console.log(`${paneName} - Saved path volume UUID:`, savedPathVolumeUUID, "Card UUID:", cardUUID);

                  if (savedPathVolumeUUID === cardUUID) {
                    // Path is on the correct volume (SD card)
                    initialPath = savedState.currentPath;
                    console.log(
                      `${paneName} - Restored navigation state for card UUID:`,
                      cardUUID,
                      "to:",
                      savedState.currentPath,
                    );
                  } else {
                    console.log(
                      `${paneName} - Saved path is on different volume (${savedPathVolumeUUID} vs ${cardUUID}), using card root:`,
                      cardPath,
                    );
                  }
                } else {
                  console.log(
                    `${paneName} - Saved path exists but is not a directory (success: ${statsResult.success}), using card root:`,
                    cardPath,
                  );
                }
              } catch (error) {
                console.log(`${paneName} - Saved path no longer exists (error: ${error}), using card root:`, cardPath);
              }
            } else {
              console.log(`${paneName} - No saved navigation state found for card UUID:`, cardUUID);
            }

            console.log(`${paneName} - Final initialPath for card:`, initialPath);

            setCurrentRootPath(initialPath);
            currentRootPathRef.current = initialPath;
            setExpandedFolders(new Set());
            setFileTree([]);

            if (cancelled) return;

            // Load the directory first
            await loadDirectory(initialPath, "root");

            if (cancelled) return;

            // Wait a bit for the file tree to populate before restoring expanded folders
            await new Promise<void>((resolve) => {
              const timeout = setTimeout(resolve, 100);
              timeouts.push(timeout);
            });

            if (cancelled) return;

            // Restore expanded folders after loading
            if (savedState?.expandedFolders && savedState.expandedFolders.length > 0) {
              console.log(`${paneName} - Restoring ${savedState.expandedFolders.length} expanded folders`);
              setPendingExpandedFolders(savedState.expandedFolders);
            }

            if (!cancelled) {
              setLoading(false);
            }
            return;
          }

          // No removable drives found - fallback to home directory (same as left pane)
          console.log(`${paneName} - No removable drives found, falling back to home directory`);
        }

        // Fallback to home directory (when no card detected or autoNavigateToCard is false)
        console.log(`${paneName} - No card detected or not auto-navigating, falling back to home directory`);
        // Home directory not available in web - use root
        const homeResult = { success: true, data: "/" };
        console.log(`${paneName} - Home directory result:`, homeResult);
        if (homeResult.success && homeResult.data) {
          const homePath = homeResult.data;
          setRootPath(homePath);
          setIsCardMounted(false); // Ensure card mounted state is false when using home directory
          rootPathRef.current = homePath;
          setDisplayTitle("Local Files");
          await refreshAvailableVolumes();

          // Get volume UUID for home directory
          volumeUUID = await getVolumeUUIDForPath(homePath);
          setCurrentVolumeUUID(volumeUUID);

          // If this is the right pane and we're falling back to home, clear the saved volume UUID
          if (autoNavigateToCard) {
            saveLastRightPaneVolumeUUID(null);
          }

          // Try to restore saved navigation state for home volume
          initialPath = homePath;
          if (volumeUUID) {
            const savedState = getNavigationState(volumeUUID);
            if (savedState) {
              // Verify the saved path still exists and is accessible
              try {
                const statsResult = await fileSystemService.getFileStats(savedState.currentPath, paneType);
                if (statsResult.success && statsResult.data?.isDirectory) {
                  initialPath = savedState.currentPath;
                  console.log(
                    `${paneName} - Restored navigation state for home volume UUID:`,
                    volumeUUID,
                    "to:",
                    savedState.currentPath,
                  );
                } else {
                  console.log(`${paneName} - Saved path exists but is not a directory, using home directory`);
                }
              } catch {
                console.log(`${paneName} - Saved path no longer exists, using home directory`);
              }
            } else {
              console.log(`${paneName} - No saved navigation state found for home volume UUID:`, volumeUUID);
            }
          }

          setCurrentRootPath(initialPath);
          currentRootPathRef.current = initialPath;
          setExpandedFolders(new Set());
          setFileTree([]);
          await loadDirectory(initialPath, "root");

          // Restore expanded folders after loading
          if (volumeUUID) {
            const savedState = getNavigationState(volumeUUID);
            if (savedState?.expandedFolders && savedState.expandedFolders.length > 0) {
              setPendingExpandedFolders(savedState.expandedFolders);
            }
          }
        } else {
          console.error(`${paneName} - Failed to get home directory`);
        }
      } catch (error) {
        if (!cancelled) {
          console.error(`${paneName} - Failed to initialize pane:`, error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    // Initialize with timeout protection
    const initPromise = initializePane();
    const initTimeout = setTimeout(() => {
      if (!cancelled) {
        console.error(`${paneName} - Initialization timeout after 30 seconds`);
        cancelled = true;
        setLoading(false);
        setPathDoesNotExist(true);
        setFileTree([]);
      }
    }, 30000);
    timeouts.push(initTimeout);

    initPromise.finally(() => {
      if (!cancelled) {
        clearTimeout(initTimeout);
      }
    });

    // Cleanup function
    return () => {
      cancelled = true;
      timeouts.forEach((timeout) => clearTimeout(timeout));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNavigateToCard, paneName]);
  // getNavigationState is intentionally omitted - it's stable (memoized) and only used inside async functions

  const toggleFolder = async (node: FileNode) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(node.id)) {
      newExpanded.delete(node.id);
    } else {
      newExpanded.add(node.id);
      // Load directory if not already loaded
      if (!node.loaded && node.type === "folder" && node.path) {
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

    // Save navigation state with expanded folders
    if (currentVolumeUUID) {
      saveNavigationState(currentVolumeUUID, currentRootPath, newExpanded);
    }
  };

  const navigateToFolder = async (folderPath: string) => {
    if (!folderPath || typeof folderPath !== "string" || folderPath.trim() === "") {
      console.error("Invalid folder path provided to navigateToFolder:", folderPath);
      return;
    }

    setCurrentRootPath(folderPath);
    currentRootPathRef.current = folderPath;
    setExpandedFolders(new Set());
    setFileTree([]);
    setPathDoesNotExist(false);

    // Get volume UUID for the new path and save navigation state
    const volumeUUID = await getVolumeUUIDForPath(folderPath);
    if (volumeUUID) {
      setCurrentVolumeUUID(volumeUUID);
      saveNavigationState(volumeUUID, folderPath, new Set());
      console.log(`${paneName} - Saved navigation state for volume UUID:`, volumeUUID, "path:", folderPath);
    }

    await loadDirectory(folderPath, "root");
  };

  const revealFolderWithSiblings = useCallback(
    async (folderPath: string) => {
      if (!folderPath || folderPath === "/") {
        await navigateToFolder("/");
        return;
      }

      const parentPath = dirname(folderPath) || "/";
      const selectedNodeId = `root-${folderPath}`;

      setCurrentRootPath(parentPath);
      currentRootPathRef.current = parentPath;
      setExpandedFolders(new Set());
      setSelectedItems(new Set());
      setFileTree([]);
      setPathDoesNotExist(false);

      await loadDirectory(parentPath, "root");

      setSelectedItems(new Set([selectedNodeId]));
      setExpandedFolders(new Set([selectedNodeId]));
      setLastSelectedIndex(0);
      await loadDirectory(folderPath, selectedNodeId);
    },
    [loadDirectory, navigateToFolder],
  );

  const navigateToNearestExistingParent = async () => {
    if (!currentRootPath) return;

    const nearestParent = await findNearestExistingParent(currentRootPath);
    if (nearestParent) {
      console.log(`${paneName} - Navigating to nearest existing parent:`, nearestParent);
      await navigateToFolder(nearestParent);
    } else {
      // Fallback to root path
      if (rootPath) {
        await navigateToFolder(rootPath);
      }
    }
  };

  const handleVolumeSelect = useCallback(
    async (volume: VolumeOption) => {
      if (typeof window === "undefined") return;

      if (normalizeVolumePath(rootPath) === normalizeVolumePath(volume.path)) {
        return;
      }

      setLoading(true);
      setSearchQuery("");
      setSelectedAudioFile(null);
      setPathDoesNotExist(false);

      try {
        // For "Local Files" (isHome), use home directory to match initialization behavior
        let targetPath = volume.path;
        if (volume.isHome) {
          // Home directory not available in web - use root
          const homeResult = { success: true, data: "/" };
          if (homeResult.success && homeResult.data) {
            targetPath = homeResult.data;
          } else {
            // Fallback to "/" if home directory can't be retrieved
            targetPath = "/";
          }
        }
        const resolvedUUID = volume.uuid ?? (await getVolumeUUIDForPath(targetPath));
        const displayName = volume.isHome ? "Local Files" : getVolumeName(volume.path);

        setRootPath(targetPath);
        rootPathRef.current = targetPath;
        setDisplayTitle(displayName);
        setIsCardMounted(volume.isRemovable);
        setCurrentVolumeUUID(resolvedUUID);

        if (autoNavigateToCard) {
          if (volume.isRemovable && resolvedUUID) {
            saveLastRightPaneVolumeUUID(resolvedUUID);
          } else {
            saveLastRightPaneVolumeUUID(null);
          }
        }

        // For "Local Files", always start at the home directory root (don't restore saved subdirectory)
        // For removable volumes, restore saved navigation state if available
        let initialPath = targetPath;
        let restoredExpanded: string[] | undefined;

        if (!volume.isHome && resolvedUUID) {
          // Only restore saved state for non-home volumes (removable drives)
          const savedState = getNavigationState(resolvedUUID);
          if (savedState?.currentPath) {
            try {
              const statsResult = await fileSystemService.getFileStats(savedState.currentPath, paneType);
              if (statsResult.success && statsResult.data?.isDirectory) {
                // Verify the saved path is on the same volume
                const savedPathVolumeUUID = await getVolumeUUIDForPath(savedState.currentPath);
                if (savedPathVolumeUUID === resolvedUUID) {
                  initialPath = savedState.currentPath;
                  restoredExpanded = savedState.expandedFolders;
                }
              }
            } catch {
              // Ignore errors restoring saved path
            }
          }
        }

        // Ensure currentRootPath matches rootPath for home directory (no ".." link)
        setCurrentRootPath(initialPath);
        currentRootPathRef.current = initialPath;
        setExpandedFolders(new Set());
        setFileTree([]);

        await loadDirectory(initialPath, "root");

        if (restoredExpanded && restoredExpanded.length > 0) {
          setPendingExpandedFolders(restoredExpanded);
        }
      } catch (error) {
        console.error("Failed to switch volume:", error);
        setPathDoesNotExist(true);
      } finally {
        setLoading(false);
        void refreshAvailableVolumes();
      }
    },
    [
      autoNavigateToCard,
      getNavigationState,
      getVolumeName,
      getVolumeUUIDForPath,
      loadDirectory,
      normalizeVolumePath,
      refreshAvailableVolumes,
      rootPath,
      saveLastRightPaneVolumeUUID,
    ],
  );

  // Save navigation state whenever currentRootPath or expandedFolders changes
  useEffect(() => {
    const saveCurrentPath = async () => {
      if (!currentRootPath || !currentVolumeUUID) return;

      if (currentVolumeUUID) {
        saveNavigationState(currentVolumeUUID, currentRootPath, expandedFolders);
        console.log(
          `${paneName} - Auto-saved navigation state for volume UUID:`,
          currentVolumeUUID,
          "path:",
          currentRootPath,
        );
      }
    };

    saveCurrentPath();
  }, [currentRootPath, currentVolumeUUID, expandedFolders, saveNavigationState, paneName]);

  // Notify parent of path/volume changes for external favorites columns
  useEffect(() => {
    if (onPathChange && currentRootPath) {
      onPathChange(currentRootPath, volumeId);
    }
  }, [currentRootPath, volumeId, onPathChange]);

  // Navigate when requestedPath is set (e.g. from favorites column)
  useEffect(() => {
    if (requestedPath && requestedPath !== currentRootPath) {
      void navigateToFolder(requestedPath);
      onRequestedPathHandled?.();
    }
  }, [requestedPath, currentRootPath, navigateToFolder, onRequestedPathHandled]);

  useEffect(() => {
    if (requestedRevealPath) {
      void revealFolderWithSiblings(requestedRevealPath);
      onRequestedRevealPathHandled?.();
    }
  }, [requestedRevealPath, revealFolderWithSiblings, onRequestedRevealPathHandled]);

  // Store selected paths to restore after refresh
  const selectedPathsToRestoreRef = useRef<Set<string> | null>(null);

  // Refresh function that preserves expanded folders and selected items
  const refreshCurrentDirectory = useCallback(async () => {
    if (!currentRootPath) return;

    // Save current expanded folders
    const currentExpanded = Array.from(expandedFolders);

    // Save current selected items by path (since IDs might change after refresh)
    const selectedPaths = new Set<string>();
    const findSelectedPaths = (nodes: FileNode[]) => {
      for (const node of nodes) {
        if (selectedItems.has(node.id)) {
          selectedPaths.add(node.path);
        }
        if (node.children) {
          findSelectedPaths(node.children);
        }
      }
    };
    findSelectedPaths(fileTree);

    console.log(
      `${paneName} - Refreshing directory while preserving ${currentExpanded.length} expanded folders and ${selectedPaths.size} selected items`,
    );

    // Store selected paths to restore later
    selectedPathsToRestoreRef.current = selectedPaths.size > 0 ? selectedPaths : null;

    // Refresh the root directory
    await loadDirectory(currentRootPath, "root");

    // Wait a bit for the file tree to update
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Restore expanded folders (this will trigger the existing restoration mechanism)
    if (currentExpanded.length > 0) {
      setPendingExpandedFolders(currentExpanded);
    } else {
      // If no expanded folders, restore selection immediately
      if (selectedPathsToRestoreRef.current) {
        setTimeout(() => {
          const restoreSelectedItems = (nodes: FileNode[]) => {
            const restoredIds = new Set<string>();
            const findNodesByPath = (nodeList: FileNode[]) => {
              for (const node of nodeList) {
                if (selectedPathsToRestoreRef.current?.has(node.path)) {
                  restoredIds.add(node.id);
                }
                if (node.children) {
                  findNodesByPath(node.children);
                }
              }
            };
            findNodesByPath(nodes);

            if (restoredIds.size > 0) {
              setSelectedItems(restoredIds);
              const flatNodes = getFlatNodeList(nodes);
              const firstSelectedId = Array.from(restoredIds)[0];
              const index = flatNodes.findIndex((n) => n.id === firstSelectedId);
              if (index >= 0) {
                setLastSelectedIndex(index);
              }
            }
            selectedPathsToRestoreRef.current = null;
          };
          restoreSelectedItems(fileTreeRef.current);
        }, 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentRootPath, expandedFolders, selectedItems, fileTree, paneName, loadDirectory]);

  // Helper to get flat list of nodes for shift-click range selection
  const getFlatNodeList = useCallback((nodes: FileNode[]): FileNode[] => {
    const flat: FileNode[] = [];
    const traverse = (nodeList: FileNode[]) => {
      for (const node of nodeList) {
        if (node.id !== "parent-link") {
          flat.push(node);
        }
        if (node.children) {
          traverse(node.children);
        }
      }
    };
    traverse(nodes);
    return flat;
  }, []);

  // Register this pane's clear selection function and handle pane activation
  useEffect(() => {
    const clearSelection = () => {
      setSelectedItems(new Set());
      setLastSelectedIndex(-1);
    };
    paneRegistry.set(paneName, clearSelection);

    return () => {
      paneRegistry.delete(paneName);
    };
  }, [paneName]);

  // Handle keyboard shortcuts for deleting selected items and arrow key navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable ||
        target.closest("input") ||
        target.closest("textarea")
      ) {
        return;
      }

      // Only handle keyboard events if this pane contains the active element or has selected items
      const paneContainer = paneContainerRef.current;
      if (!paneContainer) return;

      const activeElement = document.activeElement;
      // Check if the pane contains the active element or the event target
      // Since we clear other panes' selections when clicking, only one pane should have selections
      const isPaneFocused =
        paneContainer.contains(activeElement) || paneContainer.contains(target) || selectedItems.size > 0;

      if (!isPaneFocused) return;

      // Handle Delete/Backspace when items are selected
      if ((e.key === "Delete" || e.key === "Backspace") && selectedItems.size > 0) {
        e.preventDefault();
        e.stopPropagation();
        // Call handleDelete without arguments to delete all selected items
        if (handleDeleteRef.current) {
          void handleDeleteRef.current();
        }
        return;
      }

      // Handle Shift + Arrow Up/Down for multi-select navigation
      if (e.shiftKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        // Get the current file tree (accounting for search state)
        // Compute searchResultsAsNodes if searching
        const currentTree = searchQuery ? buildFolderTreeFromSearchResults(searchResults, currentRootPath) : fileTree;
        if (currentTree.length === 0) return;

        // Add parent link if needed (same logic as renderFileTree)
        const showParentLink = currentRootPath && currentRootPath !== rootPath;
        const itemsToRender = showParentLink
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
              ...currentTree,
            ]
          : currentTree;

        // Get flat list (excluding parent link)
        const flatNodes = getFlatNodeList(itemsToRender.filter((n) => n.id !== "parent-link"));
        if (flatNodes.length === 0) return;

        // Find the anchor index (lastSelectedIndex or first selected item's index)
        let anchorIndex = lastSelectedIndex;
        if (anchorIndex < 0 || anchorIndex >= flatNodes.length) {
          // Find first selected item's index
          if (selectedItems.size > 0) {
            const firstSelectedId = Array.from(selectedItems)[0];
            anchorIndex = flatNodes.findIndex((n) => n.id === firstSelectedId);
            if (anchorIndex < 0) return; // No valid selection found
          } else {
            // No selection yet - start from first item
            anchorIndex = 0;
          }
        }

        // Calculate new index
        const newIndex =
          e.key === "ArrowUp" ? Math.max(0, anchorIndex - 1) : Math.min(flatNodes.length - 1, anchorIndex + 1);
        if (newIndex === anchorIndex) return; // Already at boundary

        // Extend selection (similar to shift-click logic)
        const start = Math.min(anchorIndex, newIndex);
        const end = Math.max(anchorIndex, newIndex);

        setSelectedItems((prev) => {
          const newSet = new Set(prev);
          for (let i = start; i <= end; i++) {
            if (flatNodes[i] && flatNodes[i].id !== "parent-link") {
              newSet.add(flatNodes[i].id);
            }
          }
          return newSet;
        });

        setLastSelectedIndex(newIndex);
        e.preventDefault();
        e.stopPropagation();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedItems.size,
    lastSelectedIndex,
    fileTree,
    searchQuery,
    searchResults,
    currentRootPath,
    rootPath,
    getFlatNodeList,
  ]);

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
    // Check if we have multiple selected items
    const selectedNodes = getSelectedNodes(fileTree);

    // If multiple items are selected, include all of them in the drag
    if (selectedNodes.length > 1) {
      // Store all selected items as JSON in drag data
      const selectedItemsData = selectedNodes.map((n) => ({
        path: n.path,
        name: n.name,
        type: n.type,
      }));
      e.dataTransfer.setData("multipleItems", JSON.stringify(selectedItemsData));
      e.dataTransfer.setData("sourcePane", paneType);
      e.dataTransfer.setData("isMultiple", "true");
    } else {
      // Single item drag
      e.dataTransfer.setData("sourcePath", node.path);
      e.dataTransfer.setData("sourceType", node.type);
      e.dataTransfer.setData("sourcePane", paneType);
      e.dataTransfer.setData("isMultiple", "false");
    }
    e.dataTransfer.effectAllowed = "copy";
    // #region agent log
    fetch("http://127.0.0.1:7245/ingest/a31e75e3-8f4d-4254-8a14-777131006b0f", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "FilePane.tsx:handleDragStart",
        message: "dragStart",
        data: { path: node.path, type: node.type },
        timestamp: Date.now(),
        hypothesisId: "H3",
      }),
    }).catch(() => {});
    // #endregion
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

  // Copy multiple items with progress tracking
  const copyMultipleItems = useCallback(
    async (
      items: Array<{ path: string; name: string; type: "file" | "folder" }>,
      destinationPath: string,
      destinationNode?: FileNode,
      isExternal: boolean = false,
      sourcePane: "source" | "dest" = "source",
    ) => {
      if (typeof window === "undefined") return;

      // Count total files for progress tracking
      let totalFiles = 0;
      for (const item of items) {
        if (item.type === "file") {
          totalFiles++;
        } else {
          totalFiles += await countFilesRecursively(item.path);
        }
      }

      // Only show progress for multiple files
      const showProgress = totalFiles > 1;
      if (showProgress) {
        setCopyProgress({
          isVisible: true,
          current: 0,
          total: totalFiles,
          currentFile: "",
        });
      }

      let currentFileIndex = 0;
      const errors: Array<{ name: string; error: string }> = [];

      // Helper to copy folder recursively with progress tracking
      const copyFolderWithProgress = async (sourceFolder: string, destFolder: string): Promise<void> => {
        try {
          const result = await fileSystemService.readDirectory(sourceFolder, "source");
          if (!result.success || !result.data) return;

          await fileSystemService.createFolder(destFolder, basename(destFolder), "dest");

          for (const entry of result.data) {
            const entryDestPath = joinPath(destFolder, entry.name);
            if (entry.type === "file") {
              currentFileIndex++;
              if (showProgress) {
                setCopyProgress({
                  isVisible: true,
                  current: currentFileIndex,
                  total: totalFiles,
                  currentFile: entry.name,
                });
              }

              // For external drops (from Finder), treat as from different pane
              // For internal drops, check if source is from different pane
              const isFromDifferentPane = isExternal || (rootPath ? !entry.path.startsWith(rootPath) : false);
              const isAudioFile = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac)$/i.test(entry.path);

              let finalDestPath = entryDestPath;
              if (convertFiles && isFromDifferentPane && isAudioFile && fileFormat === "WAV") {
                finalDestPath = entryDestPath.replace(/\.\w+$/i, ".wav");
              }

              const needsConversion =
                convertFiles &&
                isFromDifferentPane &&
                isAudioFile &&
                (fileFormat === "WAV" ||
                  sampleRate !== "dont-change" ||
                  sampleDepth === "16-bit" ||
                  mono ||
                  normalize ||
                  trimStart);

              let copyResult;
              if (needsConversion) {
                copyResult = await fileSystemService.convertAndCopyFile(
                  entry.path,
                  dirname(finalDestPath),
                  basename(finalDestPath),
                  sampleRate !== "dont-change" ? (sampleRate === "44.1" ? 44100 : undefined) : undefined,
                  sampleDepth,
                  fileFormat,
                  mono,
                  normalize,
                  trimStart,
                  "source",
                  "dest",
                );
              } else {
                copyResult = await fileSystemService.copyFile(
                  entry.path,
                  dirname(entryDestPath),
                  basename(entryDestPath),
                  "source",
                  "dest",
                );
              }

              if (!copyResult.success) {
                errors.push({ name: entry.name, error: copyResult.error || "Unknown error" });
              } else {
                onFileTransfer?.(entry.path, destinationPath);
              }
            } else if (entry.type === "folder") {
              await copyFolderWithProgress(entry.path, entryDestPath);
            }
          }
        } catch (error) {
          errors.push({ name: basename(sourceFolder), error: String(error) });
        }
      };

      for (const item of items) {
        const fileName = basename(item.path);
        const destFilePath = joinPath(destinationPath, fileName);

        if (item.type === "file") {
          currentFileIndex++;
          if (showProgress) {
            setCopyProgress({
              isVisible: true,
              current: currentFileIndex,
              total: totalFiles,
              currentFile: item.name,
            });
          }

          // Check if file conversion is needed
          // For external drops (from Finder), treat as from different pane
          // For internal drops, check if source is from different pane
          const isFromDifferentPane = isExternal || (rootPath ? !item.path.startsWith(rootPath) : false);
          const isAudioFile = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac)$/i.test(item.path);

          let finalDestFilePath = destFilePath;
          if (convertFiles && isFromDifferentPane && isAudioFile && fileFormat === "WAV") {
            finalDestFilePath = destFilePath.replace(/\.\w+$/i, ".wav");
          }

          const needsConversion =
            convertFiles &&
            isFromDifferentPane &&
            isAudioFile &&
            (fileFormat === "WAV" ||
              sampleRate !== "dont-change" ||
              sampleDepth === "16-bit" ||
              mono ||
              normalize ||
              trimStart);

          let result;
          if (needsConversion) {
            result = await fileSystemService.convertAndCopyFile(
              item.path,
              dirname(finalDestFilePath),
              basename(finalDestFilePath),
              sampleRate !== "dont-change" ? (sampleRate === "44.1" ? 44100 : undefined) : undefined,
              sampleDepth,
              fileFormat,
              mono,
              normalize,
              trimStart,
              sourcePane,
              "dest",
            );
          } else {
            result = await fileSystemService.copyFile(
              item.path,
              dirname(destFilePath),
              basename(destFilePath),
              sourcePane,
              "dest",
            );
          }

          if (!result.success) {
            errors.push({ name: item.name, error: result.error || "Unknown error" });
          } else {
            onFileTransfer?.(item.path, destinationPath);
          }
        } else if (item.type === "folder") {
          // Copy folder recursively with progress tracking
          await copyFolderWithProgress(item.path, destFilePath);
        }
      }

      // Hide progress dialog
      if (showProgress) {
        setCopyProgress(null);
      }

      // Refresh the destination folder
      const nodeId = destinationNode ? destinationNode.id : "root";
      await loadDirectory(destinationPath, nodeId);

      // Show errors if any
      if (errors.length > 0) {
        const errorMessage = `Failed to copy ${errors.length} item(s):\n${errors
          .map((e) => `- ${e.name}: ${e.error}`)
          .join("\n")}`;
        alert(errorMessage);
      }
    },
    [
      countFilesRecursively,
      convertFiles,
      fileFormat,
      loadDirectory,
      mono,
      normalize,
      onFileTransfer,
      rootPath,
      sampleDepth,
      sampleRate,
    ],
  );

  const handleDrop = async (e: React.DragEvent, destinationNode?: FileNode) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);
    setIsDraggingOverRoot(false);

    if (!fileSystemService.hasRootForPane(paneType)) {
      console.error("No root directory selected");
      return;
    }

    // When dropMode is "navigate", navigate to dropped folder instead of converting
    if (dropMode === "navigate") {
      const sourcePath = e.dataTransfer.getData("sourcePath");
      const sourceType = e.dataTransfer.getData("sourceType");
      if (sourcePath && sourceType === "folder") {
        await navigateToFolder(sourcePath);
        return;
      }
      // Try OS drop - get path from directory handle if it's under our root
      const items = e.dataTransfer.items;
      if (items && items.length > 0) {
        const item = items[0];
        if (item.kind === "file") {
          try {
            const handle = await (item as any).getAsFileSystemHandle?.();
            if (handle?.kind === "directory") {
              const path = fileSystemService.getVirtualPath(handle as FileSystemDirectoryHandle, paneType);
              if (path) {
                await navigateToFolder(path);
                return;
              }
            }
          } catch {
            // Fall through to normal handling
          }
        }
      }
    }

    // Check if this is an external file drop (from OS file system)
    const items = e.dataTransfer.items;
    const files = e.dataTransfer.files;

    if (items && items.length > 0) {
      // External files/folders dropped from OS
      const externalItems: Array<{
        file?: File;
        handle?: FileSystemDirectoryHandle;
        name: string;
        type: "file" | "folder";
      }> = [];

      // Process each item
      for (let i = 0; i < items.length; i++) {
        const item = items[i];

        if (item.kind === "file") {
          // Try to get FileSystemHandle if available (for folders)
          try {
            const handle = await (item as any).getAsFileSystemHandle?.();
            if (handle) {
              if (handle.kind === "directory") {
                externalItems.push({
                  handle: handle as FileSystemDirectoryHandle,
                  name: handle.name,
                  type: "folder",
                });
              } else {
                const file = await (handle as FileSystemFileHandle).getFile();
                externalItems.push({
                  file,
                  name: file.name,
                  type: "file",
                });
              }
            } else {
              // Fallback to File object
              const file = item.getAsFile();
              if (file) {
                externalItems.push({
                  file,
                  name: file.name,
                  type: "file",
                });
              }
            }
          } catch {
            // Fallback to File object
            const file = item.getAsFile();
            if (file) {
              externalItems.push({
                file,
                name: file.name,
                type: "file",
              });
            }
          }
        }
      }

      // Also check files array as fallback
      if (externalItems.length === 0 && files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          externalItems.push({
            file: files[i],
            name: files[i].name,
            type: "file",
          });
        }
      }

      if (externalItems.length === 0) {
        console.warn("No valid external items found in drop");
        return;
      }

      // Determine destination path
      let destinationPath: string;
      if (destinationNode && destinationNode.type === "folder") {
        destinationPath = destinationNode.path;
      } else {
        // Drop on empty space - use current root path
        destinationPath = currentRootPath || rootPath;
      }

      if (!destinationPath || typeof destinationPath !== "string" || destinationPath.trim() === "") {
        console.error("No destination path available or invalid:", destinationPath);
        return;
      }

      // Always convert and save files/folders (single pane design)
      const itemsToProcess: Array<{
        file?: File;
        handle?: FileSystemDirectoryHandle;
        name: string;
        type: "file" | "folder";
        targetDir: string;
      }> = [];

      for (const item of externalItems) {
        if (item.type === "file" && item.file) {
          // File: convert and save in destination folder
          itemsToProcess.push({
            file: item.file,
            name: item.name,
            type: "file",
            targetDir: destinationPath,
          });
        } else if (item.type === "folder" && item.handle) {
          // Folder: create folder with same name in destination if it doesn't exist, then convert files into it
          const folderName = item.name;
          const targetFolderPath = joinPath(destinationPath, folderName);

          // Check if folder already exists
          try {
            const statsResult = await fileSystemService.getFileStats(targetFolderPath, paneType);
            if (!statsResult.success || !statsResult.data?.isDirectory) {
              // Create folder if it doesn't exist
              await fileSystemService.createFolder(dirname(targetFolderPath), basename(targetFolderPath), paneType);
            }
          } catch {
            // Folder doesn't exist, create it
            await fileSystemService.createFolder(dirname(targetFolderPath), basename(targetFolderPath), paneType);
          }

          // Get all files from the dropped folder recursively, preserving relative paths
          const getAllFilesInFolder = async (
            handle: FileSystemDirectoryHandle,
            relativePath: string = "",
          ): Promise<void> => {
            try {
              // Some TS setups don't include `dom.iterable`, so `entries()` may be missing from the type.
              for await (const [name, entryHandle] of (handle as any).entries()) {
                if (entryHandle.kind === "file") {
                  const fileHandle = entryHandle as FileSystemFileHandle;
                  const file = await fileHandle.getFile();
                  itemsToProcess.push({
                    file,
                    name,
                    type: "file",
                    targetDir: joinPath(targetFolderPath, relativePath),
                  });
                } else if (entryHandle.kind === "directory") {
                  const dirHandle = entryHandle as FileSystemDirectoryHandle;
                  const entryRelativePath = relativePath ? joinPath(relativePath, name) : name;
                  // Ensure subfolder exists in target
                  const targetSubfolderPath = joinPath(targetFolderPath, entryRelativePath);
                  try {
                    await fileSystemService.createFolder(
                      dirname(targetSubfolderPath),
                      basename(targetSubfolderPath),
                      paneType,
                    );
                  } catch {
                    // Folder might already exist, ignore
                  }
                  await getAllFilesInFolder(dirHandle, entryRelativePath);
                }
              }
            } catch (error) {
              console.error("Error reading folder:", error);
            }
          };

          await getAllFilesInFolder(item.handle);
        }
      }

      // Show confirmation dialog before converting
      if (itemsToProcess.length > 0) {
        // Store items with File objects/handles
        setPendingConversionItems(itemsToProcess as any);
        setPendingDestinationPath(destinationPath);
        setPendingDestinationNode(destinationNode);
        setConversionConfirmOpen(true);
      }

      return;
    }
  };

  // Process conversion after user confirms
  const handleConversionConfirm = useCallback(async () => {
    if (!pendingConversionItems || !pendingDestinationPath || !fileSystemService.hasRootForPane(paneType)) {
      return;
    }

    setConversionConfirmOpen(false);
    const itemsToProcess = pendingConversionItems;
    const destinationPath = pendingDestinationPath;
    const destinationNode = pendingDestinationNode;

    let currentFileIndex = 0;
    const totalFiles = itemsToProcess.length;
    const showProgress = totalFiles > 1;

    if (showProgress) {
      setCopyProgress({
        isVisible: true,
        current: 0,
        total: totalFiles,
        currentFile: "",
      });
    }

    const errors: Array<{ name: string; error: string }> = [];

    for (const item of itemsToProcess) {
      if (item.type === "file") {
        currentFileIndex++;
        if (showProgress) {
          setCopyProgress({
            isVisible: true,
            current: currentFileIndex,
            total: totalFiles,
            currentFile: item.name,
          });
        }

        // Get File object from item (either directly or from handle)
        let file: File | null = null;
        if (item.file) {
          file = item.file;
        } else if ((item as any).handle && (item as any).handle.kind === "file") {
          file = await ((item as any).handle as FileSystemFileHandle).getFile();
        } else {
          errors.push({ name: item.name, error: "File object not available" });
          continue;
        }

        const finalDestFilePath = joinPath(item.targetDir, item.name);

        // Check if file conversion is needed
        const isAudioFile = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac)$/i.test(item.name);

        let finalDestFileName = item.name;
        if (isAudioFile && fileFormat === "WAV") {
          finalDestFileName = item.name.replace(/\.\w+$/i, ".wav");
        }

        // Always convert audio files according to settings
        const needsConversion =
          isAudioFile &&
          (fileFormat === "WAV" ||
            sampleRate !== "dont-change" ||
            sampleDepth === "16-bit" ||
            mono ||
            normalize ||
            trimStart);

        let result;
        if (needsConversion) {
          // Add file first, then convert it
          const addResult = await fileSystemService.addFileFromDrop(file, item.targetDir, paneType);
          if (addResult.success && addResult.data) {
            // Now convert the file we just added
            result = await fileSystemService.convertAndCopyFile(
              addResult.data,
              item.targetDir,
              finalDestFileName,
              sampleRate !== "dont-change" ? parseFloat(sampleRate) * 1000 : undefined,
              sampleDepth,
              fileFormat,
              mono,
              normalize,
              trimStart,
              paneType,
              paneType,
            );
          } else {
            result = addResult;
          }
        } else {
          result = await fileSystemService.addFileFromDrop(file, item.targetDir, paneType);
        }

        if (result.success) {
          const finalPath = needsConversion
            ? joinPath(item.targetDir, finalDestFileName)
            : joinPath(item.targetDir, item.name);
          onFileTransfer?.(finalPath, finalPath);
        } else {
          errors.push({ name: item.name, error: result.error || "Unknown error" });
        }
      }
    }

    if (showProgress) {
      setCopyProgress(null);
    }

    // Refresh the destination folder
    const nodeId = destinationNode ? destinationNode.id : "root";
    await loadDirectory(destinationPath, nodeId);

    // Show errors if any
    if (errors.length > 0) {
      const errorMessage = `Failed to copy ${errors.length} item(s):\n${errors
        .map((e) => `- ${e.name}: ${e.error}`)
        .join("\n")}`;
      alert(errorMessage);
    }

    // Clear pending state
    setPendingConversionItems(null);
    setPendingDestinationPath("");
    setPendingDestinationNode(undefined);
  }, [
    pendingConversionItems,
    pendingDestinationPath,
    pendingDestinationNode,
    fileFormat,
    sampleRate,
    sampleDepth,
    mono,
    normalize,
    trimStart,
    loadDirectory,
    onFileTransfer,
  ]);

  const handleDelete = async (node?: FileNode) => {
    // Check if we have multiple selected items
    const selectedNodes = node ? [node] : getSelectedNodes(fileTree);

    if (selectedNodes.length === 0) return;

    const itemCount = selectedNodes.length;
    const itemType = itemCount === 1 ? (selectedNodes[0].type === "file" ? "file" : "folder") : "items";
    const confirmMessage =
      itemCount === 1
        ? `Are you sure you want to delete ${itemType} "${selectedNodes[0].name}"?`
        : `Are you sure you want to delete ${itemCount} ${itemType}?`;

    if (!confirm(confirmMessage)) {
      return;
    }

    const errors: Array<{ name: string; error: string }> = [];
    const deletedPaths = new Set<string>();

    for (const nodeToDelete of selectedNodes) {
      try {
        let result;
        if (nodeToDelete.type === "file") {
          result = await fileSystemService.deleteFile(nodeToDelete.path, paneType);
        } else {
          result = await fileSystemService.deleteFolder(nodeToDelete.path, paneType);
        }

        if (result.success) {
          deletedPaths.add(nodeToDelete.path);
          // Find parent directory to refresh
          const parentPath = nodeToDelete.path.split("/").slice(0, -1).join("/");
          if (parentPath && !deletedPaths.has(parentPath)) {
            // Find the parent node ID
            const findParentNodeId = (nodes: FileNode[], targetPath: string): string | null => {
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

            const parentNodeId = findParentNodeId(fileTree, parentPath) || "root";
            await loadDirectory(parentPath, parentNodeId);
          } else {
            // If it's the root, reload the root
            if (rootPath) {
              await loadDirectory(rootPath, "root");
            }
          }
        } else {
          errors.push({ name: nodeToDelete.name, error: result.error || "Unknown error" });
        }
      } catch (error) {
        errors.push({ name: nodeToDelete.name, error: String(error) });
      }
    }

    // Clear selection after deletion
    setSelectedItems(new Set());

    // Show errors if any
    if (errors.length > 0) {
      const errorMessage = `Failed to delete ${errors.length} item(s):\n${errors
        .map((e) => `- ${e.name}: ${e.error}`)
        .join("\n")}`;
      alert(errorMessage);
    }
  };

  // Update ref after handleDelete is defined
  useEffect(() => {
    handleDeleteRef.current = handleDelete;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  });

  const handleEject = async () => {
    if (!isCardMounted || !rootPath) return;

    try {
      console.log(`${paneName} - Ejecting volume:`, rootPath);
      // Eject not available in web
      const ejectResult = { success: false, error: "Eject not available in web browser" };

      if (!ejectResult.success) {
        console.error("Failed to eject volume:", ejectResult.error);
        alert(`Failed to eject card: ${ejectResult.error}`);
        return;
      }

      // Then navigate back to home directory
      const homeResult = { success: true, data: "/" };
      if (homeResult?.success && homeResult.data) {
        const homePath = homeResult.data;
        const volumeUUID = await getVolumeUUIDForPath(homePath);
        setCurrentVolumeUUID(volumeUUID);
        setRootPath(homePath);
        rootPathRef.current = homePath;
        setDisplayTitle("Local Files");
        saveLastRightPaneVolumeUUID(null);

        // Try to restore saved navigation state
        let initialPath = homePath;
        if (volumeUUID) {
          const savedState = getNavigationState(volumeUUID);
          if (savedState) {
            try {
              const statsResult = await fileSystemService.getFileStats(savedState.currentPath, paneType);
              if (statsResult.success && statsResult.data?.isDirectory) {
                initialPath = savedState.currentPath;
                console.log(
                  `${paneName} - Restored navigation state for home volume UUID:`,
                  volumeUUID,
                  "to:",
                  savedState.currentPath,
                );
              } else {
                console.log(`${paneName} - Saved path exists but is not a directory, using home directory`);
              }
            } catch {
              console.log(`${paneName} - Saved path no longer exists, using home directory`);
            }
          }
        }

        setCurrentRootPath(initialPath);
        setIsCardMounted(false);
        currentRootPathRef.current = initialPath;
        setExpandedFolders(new Set());
        setFileTree([]);
        await loadDirectory(initialPath, "root");

        // Restore expanded folders after loading
        if (volumeUUID) {
          const savedState = getNavigationState(volumeUUID);
          if (savedState?.expandedFolders && savedState.expandedFolders.length > 0) {
            setPendingExpandedFolders(savedState.expandedFolders);
          }
        }
        void refreshAvailableVolumes();
      }
    } catch (error) {
      console.error(`${paneName} - Error ejecting card:`, error);
      alert(`Error ejecting card: ${error}`);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !fileSystemService.hasRootDirectory()) return;

    try {
      const folderPath = joinPath(currentRootPath || rootPath, newFolderName.trim());
      const result = await fileSystemService.createFolder(dirname(folderPath), basename(folderPath), paneType);

      if (result.success) {
        // Refresh the current directory
        const refreshPath = currentRootPath || rootPath;
        if (refreshPath) {
          await loadDirectory(refreshPath, "root");
        }
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

  // Effect to search files using mdfind (macOS Spotlight) - much faster than recursive directory reading
  useEffect(() => {
    if (!searchQuery || loading) {
      setIsSearchingFolders(false);
      setSearchResults([]);
      isSearchLoadingRef.current = false;
      searchCancelledRef.current = false;
      return;
    }

    // Cancel any previous search that's in progress
    searchCancelledRef.current = true;
    isSearchLoadingRef.current = false;

    // Update the ref to the new query immediately
    currentSearchQueryRef.current = searchQuery;

    let cancelled = false;
    const currentSearchQuery = searchQuery; // Capture the query for this search

    const timeout = setTimeout(async () => {
      // Check if this effect was cancelled (cleanup ran)
      if (cancelled) {
        return;
      }

      // Check if query has changed since we started this timeout
      // (if user typed again, the ref would have been updated)
      if (currentSearchQueryRef.current !== currentSearchQuery) {
        return;
      }

      // Clear cancelled flag and start the search
      searchCancelledRef.current = false;
      isSearchLoadingRef.current = true;
      setIsSearchingFolders(true);

      try {
        console.log("Searching with mdfind:", currentSearchQuery);
        // Optionally limit search to current root path or search entire system
        const searchPath = currentRootPath || undefined;
        const result = await fileSystemService.searchFiles(currentSearchQuery, searchPath, paneType);

        // Double-check this search is still valid (query hasn't changed)
        if (cancelled || currentSearchQueryRef.current !== currentSearchQuery) {
          return;
        }

        if (result.success && result.data) {
          setSearchResults(result.data);
        } else {
          console.error("Search failed:", result.error);
          setSearchResults([]);
        }
      } catch (error) {
        console.error("Error searching files:", error);
        if (!cancelled && currentSearchQueryRef.current === currentSearchQuery) {
          setSearchResults([]);
        }
      } finally {
        if (!cancelled && currentSearchQueryRef.current === currentSearchQuery) {
          setIsSearchingFolders(false);
        }
        isSearchLoadingRef.current = false;
      }
    }, 300); // Debounce delay

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      // Don't clear search results here - let the new search set them
      // Only clear loading state if we're cancelling
      if (isSearchLoadingRef.current) {
        setIsSearchingFolders(false);
        isSearchLoadingRef.current = false;
      }
    };
  }, [searchQuery, loading, currentRootPath]);

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

    const flatNodes = depth === 0 ? getFlatNodeList(itemsToRender.filter((n) => n.id !== "parent-link")) : [];

    return itemsToRender.map((node, index) => {
      const isExpanded = expandedFolders.has(node.id);
      const hasChildren = node.children && node.children.length > 0;
      const isDragOver = dragOverPath === node.path;
      const isParentLink = node.id === "parent-link";
      const isSelected = selectedItems.has(node.id);

      const handleRevealInFinder = async (e: React.MouseEvent) => {
        e.stopPropagation();
        if (isParentLink) return;

        try {
          // Reveal in Finder not available in web
          const result = { success: false, error: "Reveal in Finder not available in web browser" };
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
                data-testid={
                  isParentLink
                    ? `tree-node-${paneName}-parent`
                    : `tree-node-${paneName}-${node.path.replace(/[^a-zA-Z0-9_-]/g, "_")}`
                }
                data-selected={isSelected && !isParentLink ? "true" : "false"}
                data-expanded={node.type === "folder" && isExpanded ? "true" : "false"}
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
                className={`relative flex items-center gap-2 py-1.5 px-2 rounded group transition-colors ${
                  node.type === "folder" || (node.type === "file" && (isAudioFile(node.name) || isVideoFile(node.name)))
                    ? "cursor-pointer"
                    : ""
                } ${
                  isDragOver && node.type === "folder" && !isParentLink
                    ? "bg-primary/20 border border-primary"
                    : isSelected && !isParentLink
                      ? "bg-primary/10 border border-primary/30"
                      : "hover:bg-secondary/50"
                }`}
                style={{ paddingLeft: `${depth * 16 + 8}px` }}
                onClick={(e) => {
                  if (isParentLink) {
                    navigateToParent();
                    return;
                  }

                  // Handle multi-select
                  if (e.ctrlKey || e.metaKey) {
                    // Ctrl/Cmd+click: toggle selection
                    e.stopPropagation();
                    setSelectedItems((prev) => {
                      const newSet = new Set(prev);
                      if (newSet.has(node.id)) {
                        newSet.delete(node.id);
                      } else {
                        newSet.add(node.id);
                      }
                      return newSet;
                    });
                    setLastSelectedIndex(flatNodes.findIndex((n) => n.id === node.id));
                    return;
                  }

                  if (e.shiftKey && lastSelectedIndex >= 0 && depth === 0) {
                    // Shift+click: select range
                    e.stopPropagation();
                    const currentIndex = flatNodes.findIndex((n) => n.id === node.id);
                    if (currentIndex >= 0) {
                      const start = Math.min(lastSelectedIndex, currentIndex);
                      const end = Math.max(lastSelectedIndex, currentIndex);
                      setSelectedItems((prev) => {
                        const newSet = new Set(prev);
                        for (let i = start; i <= end; i++) {
                          if (flatNodes[i] && flatNodes[i].id !== "parent-link") {
                            newSet.add(flatNodes[i].id);
                          }
                        }
                        return newSet;
                      });
                    }
                    return;
                  }

                  // Single click: always clear previous selection and select this item
                  setSelectedItems(new Set([node.id]));
                  setLastSelectedIndex(flatNodes.findIndex((n) => n.id === node.id));
                  // Clear selections in other panes when selecting in this pane
                  handlePaneClick();

                  if (node.type === "folder") {
                    // If this is a search result folder, navigate to it and clear search
                    if (searchQuery && node.id.startsWith("search-folder-")) {
                      setSearchQuery("");
                      navigateToFolder(node.path);
                    } else {
                      toggleFolder(node);
                    }
                  } else if (node.type === "file" && isAudioFile(node.name)) {
                    setSelectedAudioFile({ path: node.path, name: node.name });
                    setSelectedVideoFile(null); // Clear video preview if audio is selected
                  } else if (node.type === "file" && isVideoFile(node.name)) {
                    setSelectedVideoFile({ path: node.path, name: node.name });
                    setSelectedAudioFile(null); // Clear audio preview if video is selected
                  }
                }}
                onDoubleClick={() => {
                  if (!isParentLink && node.type === "folder") {
                    // If this is a search result folder, clear search when navigating
                    if (searchQuery && node.id.startsWith("search-folder-")) {
                      setSearchQuery("");
                    }
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
                    <Folder className={`w-4 h-4 shrink-0 ${isParentLink ? "text-muted-foreground" : "text-primary"}`} />
                  </>
                ) : (
                  <>
                    <span className="w-4" />
                    <File className="w-4 h-4 text-muted-foreground shrink-0" />
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
                {isSelected && !isParentLink && <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary" />}
              </div>
            </ContextMenuTrigger>
            {!isParentLink && (
              <ContextMenuContent>
                <ContextMenuItem onClick={handleRevealInFinder}>Reveal in Finder</ContextMenuItem>
                {node.type === "folder" && (
                  <ContextMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isFavorite(node.path)) {
                        addFavorite(node.path, node.name);
                      }
                    }}
                    disabled={isFavorite(node.path)}
                  >
                    {isFavorite(node.path) ? "Already in favourites" : "Add favourite"}
                  </ContextMenuItem>
                )}
                <ContextMenuItem
                  onClick={(e) => {
                    e.stopPropagation();
                    // If there are selected items, delete all selected items
                    // Otherwise, delete just the item being right-clicked
                    if (selectedItems.size > 0) {
                      handleDelete();
                    } else {
                      handleDelete(node);
                    }
                  }}
                  className="text-destructive focus:text-destructive"
                >
                  {selectedItems.size > 0
                    ? `Delete ${selectedItems.size} selected item${selectedItems.size > 1 ? "s" : ""}`
                    : "Delete"}
                </ContextMenuItem>
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

  // Convert search results to folder tree structure - only show folders containing matches
  const buildFolderTreeFromSearchResults = (
    results: Array<{ name: string; path: string; type: "file" | "folder"; size: number; isDirectory: boolean }>,
    searchRootPath?: string,
  ): FileNode[] => {
    if (results.length === 0) return [];

    // Extract all unique folder paths that contain matches
    const folderPaths = new Set<string>();

    results.forEach((result) => {
      // Get the parent directory of each result
      const parentPath = dirname(result.path);
      if (parentPath && parentPath !== "." && parentPath !== "/") {
        // If searching within a specific path, only include folders within that path
        if (!searchRootPath || parentPath.startsWith(searchRootPath)) {
          folderPaths.add(parentPath);
        }
      }

      // If the result itself is a folder, include it
      if (result.isDirectory) {
        if (!searchRootPath || result.path.startsWith(searchRootPath)) {
          folderPaths.add(result.path);
        }
      }
    });

    if (folderPaths.size === 0) return [];

    // Build a tree structure from folder paths
    const folderMap = new Map<string, FileNode>();
    const rootFolders: FileNode[] = [];

    // Sort folder paths by depth (shallowest first)
    const sortedPaths = Array.from(folderPaths).sort((a, b) => {
      const depthA = a.split("/").filter(Boolean).length;
      const depthB = b.split("/").filter(Boolean).length;
      return depthA - depthB;
    });

    // Determine the root path for the tree (either searchRootPath or common ancestor)
    const treeRoot =
      searchRootPath ||
      (() => {
        // Find common root path
        const paths = Array.from(folderPaths);
        if (paths.length === 0) return "";
        let commonRoot = paths[0];
        for (let i = 1; i < paths.length; i++) {
          const parts = commonRoot.split("/").filter(Boolean);
          const otherParts = paths[i].split("/").filter(Boolean);
          let j = 0;
          while (j < parts.length && j < otherParts.length && parts[j] === otherParts[j]) {
            j++;
          }
          commonRoot = "/" + parts.slice(0, j).join("/");
        }
        return commonRoot || "/";
      })();

    sortedPaths.forEach((folderPath) => {
      const parts = folderPath.split("/").filter(Boolean);
      const folderName = parts[parts.length - 1];

      // Create folder node
      const folderNode: FileNode = {
        id: `search-folder-${folderPath}`,
        name: folderName,
        type: "folder",
        path: folderPath,
        loaded: false, // Not loaded yet - user can expand to see contents
        children: undefined,
      };

      folderMap.set(folderPath, folderNode);

      // Find parent folder
      const parentPath = dirname(folderPath);
      if (parentPath && parentPath !== treeRoot && parentPath !== "/") {
        const parentNode = folderMap.get(parentPath);
        if (parentNode) {
          if (!parentNode.children) {
            parentNode.children = [];
          }
          parentNode.children.push(folderNode);
        } else {
          // Parent not in our set yet, add to root
          rootFolders.push(folderNode);
        }
      } else {
        // Root level folder (relative to tree root)
        rootFolders.push(folderNode);
      }
    });

    // Sort root folders alphabetically
    rootFolders.sort((a, b) => a.name.localeCompare(b.name));

    return rootFolders;
  };

  const searchResultsAsNodes: FileNode[] = searchQuery
    ? buildFolderTreeFromSearchResults(searchResults, currentRootPath)
    : [];

  const filteredFileSystem = filterNodes(fileTree, searchQuery);

  const filterFoldersOnly = useCallback((nodes: FileNode[]): FileNode[] => {
    return nodes
      .filter((n) => n.type === "folder")
      .map((n) => ({
        ...n,
        children: n.children ? filterFoldersOnly(n.children) : n.children,
      }));
  }, []);

  const filteredTreeNodes = treeViewMode === "folders" ? filterFoldersOnly(filteredFileSystem) : filteredFileSystem;
  const searchTreeNodes =
    treeViewMode === "folders" ? searchResultsAsNodes.filter((n) => n.type === "folder") : searchResultsAsNodes;
  const activeTreeNodes = searchQuery ? searchTreeNodes : filteredTreeNodes;

  // Handle pane click to clear other panes' selections
  const handlePaneClick = () => {
    // Clear selections in all other panes
    paneRegistry.forEach((clearSelection, name) => {
      if (name !== paneName) {
        clearSelection();
      }
    });
  };

  // Debug: Log when component renders
  useEffect(() => {
    console.log("FilePane rendering, loading:", loading, "rootPath:", rootPath);
  });

  // Handler for navigating to a favorite
  const handleFavoriteClick = async (favoritePath: string) => {
    if (!fileSystemService.hasRootForPane(paneType)) return;
    await navigateToFolder(favoritePath);
  };

  return (
    <div ref={paneContainerRef} className="flex h-full w-full min-w-0 bg-background overflow-hidden">
      {/* Left Sidebar - Finder style (hidden when showSidebar=false) */}
      {showSidebar && (
        <div className="w-56 bg-muted border-r border-border flex flex-col shrink-0 h-full overflow-hidden">
          <ScrollArea className="flex-1 h-full">
            <div className="p-2 space-y-4">
              {/* Directory Selection Section */}
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Directory
                </div>
                <div className="space-y-0.5 mt-1">
                  {fileSystemService.hasRootForPane(paneType) ? (
                    <div className="px-2 py-1.5 text-sm text-foreground">
                      <div className="flex items-center gap-2">
                        <Folder className="w-4 h-4" />
                        <span className="truncate">{fileSystemService.getRootDirectoryName(paneType)}</span>
                      </div>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="w-full justify-start" onClick={requestRootDirectory}>
                      <FolderPlus className="w-4 h-4 mr-2" />
                      Select Directory
                    </Button>
                  )}
                </div>
              </div>

              {/* Favorites Section */}
              <div>
                <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Favorites
                </div>
                <div className="space-y-0.5 mt-1">
                  {favorites.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">No favorites</div>
                  ) : (
                    favorites.map((favorite) => {
                      const isActive = currentRootPath === favorite.path;
                      return (
                        <div
                          key={favorite.path}
                          className={`group flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors ${
                            isActive ? "bg-primary/10 text-primary font-medium" : "text-foreground hover:bg-muted/50"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleFavoriteClick(favorite.path)}
                            className="flex items-center gap-2 flex-1 min-w-0 shrink-0"
                          >
                            <Star className="w-3 h-3 shrink-0 fill-current" />
                            <span className="truncate text-left">{favorite.name}</span>
                          </button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-5 w-5 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeFavorite(favorite.path);
                            }}
                            title="Remove from favorites"
                          >
                            <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
                          </Button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex flex-col flex-1 min-w-0 h-full bg-background overflow-hidden">
        {/* Header */}
        <div className="border-b border-border flex flex-col shrink-0">
          <div className="p-4 pb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
            {onBrowseForFolder && (
              <Button
                size="sm"
                variant="outline"
                className="gap-2"
                onClick={() => onBrowseForFolder(currentRootPath || "/")}
                title="Browse for folder to navigate to"
              >
                  <FolderOpen className="w-4 h-4" />
                </Button>
              )}
              <div className="flex items-center rounded-md border border-border overflow-hidden">
                <Button
                  size="sm"
                  variant={treeViewMode === "all" ? "secondary" : "ghost"}
                  className="rounded-none"
                  onClick={() => setTreeViewMode("all")}
                  title="Show files and folders"
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={treeViewMode === "folders" ? "secondary" : "ghost"}
                  className="rounded-none"
                  onClick={() => setTreeViewMode("folders")}
                  title="Show folders only"
                >
                  Folders
                </Button>
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search files..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-9 w-48"
                />
                {/* Reserve space for loader to prevent layout shifts */}
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2 w-3 h-3 flex items-center justify-center">
                  {isSearchingFolders && <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button size="sm" variant="outline" className="gap-2">
                    {sortBy === "name"
                      ? "Name"
                      : sortBy === "dateAdded"
                        ? "Date Added"
                        : sortBy === "dateCreated"
                          ? "Date Created"
                          : sortBy === "dateModified"
                            ? "Date Modified"
                            : "Date Last Opened"}
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setSortBy("name")}>
                    <Check className={`w-4 h-4 mr-2 ${sortBy === "name" ? "opacity-100" : "opacity-0"}`} />
                    Name
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("dateAdded")}>
                    <Check className={`w-4 h-4 mr-2 ${sortBy === "dateAdded" ? "opacity-100" : "opacity-0"}`} />
                    Date Added
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("dateCreated")}>
                    <Check className={`w-4 h-4 mr-2 ${sortBy === "dateCreated" ? "opacity-100" : "opacity-0"}`} />
                    Date Created
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("dateModified")}>
                    <Check className={`w-4 h-4 mr-2 ${sortBy === "dateModified" ? "opacity-100" : "opacity-0"}`} />
                    Date Modified
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setSortBy("dateLastOpened")}>
                    <Check className={`w-4 h-4 mr-2 ${sortBy === "dateLastOpened" ? "opacity-100" : "opacity-0"}`} />
                    Date Last Opened
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={() => refreshCurrentDirectory()}
                title="Refresh"
                disabled={!currentRootPath || loading}
              >
                <RotateCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
              </Button>
              {showNewFolderButton && (
                <Button size="sm" variant="secondary" className="gap-2" onClick={() => setNewFolderDialogOpen(true)}>
                  <FolderPlus className="w-4 h-4" />
                  New Folder
                </Button>
              )}
            </div>
          </div>
          {/* Breadcrumb row: full width below header */}
          {fileSystemService.hasRootForPane(paneType) && currentRootPath && (
            <div className="px-4 pb-2 flex items-center gap-1 min-w-0 text-sm text-muted-foreground overflow-x-auto">
              <span className="text-muted-foreground/60 shrink-0">/</span>
              <button
                type="button"
                onClick={() => navigateToFolder("/")}
                className={`truncate hover:text-foreground transition-colors shrink-0 ${currentRootPath === "/" || currentRootPath === "" ? "font-medium text-foreground" : ""}`}
                title={fileSystemService.getRootDirectoryName(paneType)}
              >
                {fileSystemService.getRootDirectoryName(paneType)}
              </button>
              {currentRootPath &&
                currentRootPath !== "/" &&
                currentRootPath
                  .split("/")
                  .filter(Boolean)
                  .map((segment, i, parts) => {
                    const pathUpToHere = "/" + parts.slice(0, i + 1).join("/");
                    const isCurrent = i === parts.length - 1;
                    return (
                      <span key={pathUpToHere} className="flex items-center gap-1 shrink-0">
                        <span className="text-muted-foreground/60">/</span>
                        <button
                          type="button"
                          onClick={() => navigateToFolder(pathUpToHere)}
                          className={`truncate max-w-32 hover:text-foreground transition-colors ${isCurrent ? "font-medium text-foreground" : ""}`}
                          title={segment}
                        >
                          {segment}
                        </button>
                      </span>
                    );
                  })}
            </div>
          )}
        </div>

        {/* File Tree */}
        <ScrollArea className="flex-1 h-full">
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
            onClick={(e) => {
              // Clear selection when clicking on empty space (not on a file/folder item)
              const target = e.target as HTMLElement;
              if (target === e.currentTarget || (!target.closest('[draggable="true"]') && !target.closest("button"))) {
                setSelectedItems(new Set());
                // Also clear selections in other panes
                handlePaneClick();
              }
            }}
          >
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
              </div>
            ) : pathDoesNotExist ? (
              <div className="text-center py-8">
                {onBrowseForFolder ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    data-testid={`select-folder-${paneName}`}
                    onClick={() => onBrowseForFolder(currentRootPath || "/")}
                  >
                    <FolderOpen className="w-4 h-4" />
                    Select folder
                  </Button>
                ) : (
                  <Button onClick={navigateToNearestExistingParent} size="sm" variant="outline">
                    Navigate to nearest existing folder
                  </Button>
                )}
              </div>
            ) : isSearchingFolders ? (
              <div className="flex items-center justify-center py-8">
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                  <div className="text-sm text-muted-foreground">Searching...</div>
                </div>
              </div>
            ) : searchQuery && searchResultsAsNodes.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No files found matching &quot;{searchQuery}&quot;
              </div>
            ) : activeTreeNodes.length === 0 ? (
              <>
                {/* Render file tree with empty array - renderFileTree will add parent link if needed */}
                {!searchQuery && renderFileTree([])}
                <div
                  className={`text-center py-8 text-sm border-2 border-dashed rounded-lg transition-colors ${
                    isDraggingOverRoot ? "border-primary bg-primary/10" : "border-muted text-muted-foreground"
                  }`}
                >
                  {pathDoesNotExist ? (
                    <div className="space-y-3">
                      <div className="text-amber-600 dark:text-amber-500">
                        Directory does not exist: {currentRootPath || rootPath}
                      </div>
                      {currentRootPath && currentRootPath !== rootPath ? (
                        <Button size="sm" variant="outline" onClick={navigateToParent} className="gap-2">
                          <ArrowUp className="w-4 h-4" />
                          Go to Parent Folder
                        </Button>
                      ) : onBrowseForFolder ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button size="sm" variant="outline" className="gap-2">
                              <FolderOpen className="w-4 h-4" />
                              Choose folder to navigate to
                              <ChevronDown className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="center">
                            <DropdownMenuItem onClick={() => onBrowseForFolder(currentRootPath || "/")}>
                              <FolderOpen className="w-4 h-4 mr-2" />
                              Browse for folder...
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={navigateToNearestExistingParent}>
                              <ArrowUp className="w-4 h-4 mr-2" />
                              Navigate to nearest existing folder
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : (
                        <Button size="sm" variant="outline" onClick={navigateToNearestExistingParent} className="gap-2">
                          <ArrowUp className="w-4 h-4" />
                          Navigate to Nearest Existing Parent
                        </Button>
                      )}
                    </div>
                  ) : searchQuery ? (
                    <div className="text-muted-foreground">No files found matching &quot;{searchQuery}&quot;</div>
                  ) : (
                    <div className="text-muted-foreground">
                      {treeViewMode === "folders" ? "No folders found" : "No files found"}
                    </div>
                  )}
                </div>
              </>
            ) : searchQuery ? (
              renderFileTree(searchTreeNodes)
            ) : (
              renderFileTree(filteredTreeNodes)
            )}
          </div>
        </ScrollArea>
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

      {/* Audio Preview */}
      {selectedAudioFile && (
        <AudioPreview
          filePath={selectedAudioFile.path}
          fileName={selectedAudioFile.name}
          onClose={() => setSelectedAudioFile(null)}
          paneType={paneType}
        />
      )}

      {/* Video Preview */}
      {selectedVideoFile && (
        <VideoPreview
          filePath={selectedVideoFile.path}
          fileName={selectedVideoFile.name}
          onClose={() => setSelectedVideoFile(null)}
          paneType={paneType}
        />
      )}

      {/* Copy Progress Dialog */}
      {copyProgress && copyProgress.isVisible && (
        <Dialog open={true} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Copying Files</DialogTitle>
              <DialogDescription>
                {copyProgress.currentFile && (
                  <div className="mt-2 text-sm text-muted-foreground truncate">{copyProgress.currentFile}</div>
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">
                    {copyProgress.current} of {copyProgress.total} files
                  </span>
                </div>
                <Progress value={(copyProgress.current / copyProgress.total) * 100} className="h-2" />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Conversion Confirmation Dialog */}
      {pendingConversionItems && (
        <ConversionConfirmDialog
          open={conversionConfirmOpen}
          onOpenChange={setConversionConfirmOpen}
          onConfirm={handleConversionConfirm}
          fileCount={pendingConversionItems.length}
          settings={{
            sampleRate,
            sampleDepth,
            fileFormat,
            mono,
            normalize,
            trimStart,
          }}
        />
      )}
    </div>
  );
};
