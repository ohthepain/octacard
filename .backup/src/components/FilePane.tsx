import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Folder,
  File,
  ChevronRight,
  ChevronDown,
  Search,
  Trash2,
  FolderPlus,
  Loader2,
  XCircle,
  ArrowUp,
} from "lucide-react";
import { ScrollArea } from "../../../src/components/ui/scroll-area";
import { Button } from "../../../src/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../../src/components/ui/dialog";
import { Input } from "../../../src/components/ui/input";
import { Label } from "../../../src/components/ui/label";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../../src/components/ui/context-menu";
import { useNavigationState } from "../../../src/hooks/use-navigation-state";

// Type declaration for window.electron
declare global {
  interface Window {
    electron?: {
      fs: any;
      on: {
        sdCardDetected: (callback: (cardPath: string, cardUUID: string) => void) => void;
        sdCardRemoved: (callback: (cardPath: string, cardUUID: string) => void) => void;
      };
      removeListener: (channel: string) => void;
    };
  }
}

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

interface FilePaneProps {
  paneName: string;
  title: string;
  onFileTransfer?: (sourcePath: string, destinationPath: string) => void;
  sampleRate?: string;
  sampleDepth?: string;
  fileFormat?: string;
  mono?: boolean;
  normalize?: boolean;
  autoNavigateToCard?: boolean;
  convertFiles?: boolean;
  showEjectButton?: boolean;
  showNewFolderButton?: boolean;
}

export const FilePane = ({
  paneName,
  title,
  onFileTransfer,
  sampleRate = "dont-change",
  sampleDepth = "dont-change",
  fileFormat = "dont-change",
  mono = false,
  normalize = false,
  autoNavigateToCard = false,
  convertFiles = false,
  showEjectButton = false,
  showNewFolderButton = false,
}: FilePaneProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [rootPath, setRootPath] = useState<string>("");
  const [currentRootPath, setCurrentRootPath] = useState<string>("");
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [isDraggingOverRoot, setIsDraggingOverRoot] = useState(false);
  const [currentVolumeUUID, setCurrentVolumeUUID] = useState<string | null>(null);
  const [pathDoesNotExist, setPathDoesNotExist] = useState(false);
  const [isCardMounted, setIsCardMounted] = useState(false);
  const [newFolderDialogOpen, setNewFolderDialogOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const currentRootPathRef = useRef<string>("");
  const rootPathRef = useRef<string>("");
  const { saveNavigationState, getNavigationState } = useNavigationState(paneName);

  // Keep refs in sync with state
  useEffect(() => {
    currentRootPathRef.current = currentRootPath;
  }, [currentRootPath]);

  useEffect(() => {
    rootPathRef.current = rootPath;
  }, [rootPath]);

  // Helper function to get volume UUID for a path
  const getVolumeUUIDForPath = async (path: string): Promise<string | null> => {
    if (!window.electron) return null;
    try {
      const result = await window.electron.fs.getVolumeInfo(path);
      if (result.success && result.data) {
        return result.data.uuid;
      }
    } catch (error) {
      console.error("Failed to get volume UUID:", error);
    }
    return null;
  };

  // Find the nearest existing parent folder
  const findNearestExistingParent = useCallback(
    async (dirPath: string): Promise<string | null> => {
      if (!window.electron) return null;

      const parts = dirPath.split("/").filter(Boolean);
      if (parts.length === 0) return null;

      // Try each parent directory starting from the immediate parent
      for (let i = parts.length - 1; i > 0; i--) {
        const parentPath = dirPath.startsWith("/") ? "/" + parts.slice(0, i).join("/") : parts.slice(0, i).join("/");

        try {
          const statsResult = await window.electron.fs.getFileStats(parentPath);
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
          const statsResult = await window.electron.fs.getFileStats(rootPath);
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
      if (!window.electron) return;

      // Validate that dirPath is a valid string
      if (!dirPath || typeof dirPath !== "string" || dirPath.trim() === "") {
        console.error("Invalid directory path provided to loadDirectory:", dirPath);
        return;
      }

      try {
        console.log(`${paneName} - Loading directory:`, dirPath);
        const result = await window.electron.fs.readDirectory(dirPath);
        console.log(`${paneName} - Directory read result:`, result);
        if (result.success && result.data) {
          // Directory exists, clear the error state
          setPathDoesNotExist(false);

          // Filter out hidden files/folders (starting with '.' or '~')
          const filteredEntries = result.data.filter(
            (entry) => !entry.name.startsWith(".") && !entry.name.startsWith("~"),
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
    [paneName],
  );

  const [pendingExpandedFolders, setPendingExpandedFolders] = useState<string[]>([]);
  const [isRestoringExpanded, setIsRestoringExpanded] = useState(false);

  // Effect to restore expanded folders when fileTree is populated
  useEffect(() => {
    if (pendingExpandedFolders.length === 0 || fileTree.length === 0 || isRestoringExpanded) return;

    let cancelled = false;
    const timeouts: NodeJS.Timeout[] = [];

    const restoreExpandedFolders = async () => {
      setIsRestoringExpanded(true);
      const expandedSet = new Set(pendingExpandedFolders);

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
              await loadDirectory(node.path, node.id);
              if (cancelled) return;

              // Wait for load to complete
              await new Promise<void>((resolve) => {
                const timeout = setTimeout(resolve, 100);
                timeouts.push(timeout);
              });
            }

            if (cancelled) return;

            // Process children recursively
            if (node.children && node.children.length > 0) {
              await processNodes(node.children, true);
            }
          }
        }
      };

      await processNodes(fileTree, true);

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
  }, [fileTree, pendingExpandedFolders, loadDirectory, isRestoringExpanded]);

  useEffect(() => {
    let cancelled = false;
    const timeouts: NodeJS.Timeout[] = [];

    // Initialize directory
    const initializePane = async () => {
      // Wait a bit for preload script to load
      let retries = 0;
      while (!window.electron && retries < 10 && !cancelled) {
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 100);
          timeouts.push(timeout);
        });
        retries++;
      }

      if (cancelled || !window.electron) {
        if (!cancelled && !window.electron) {
          console.error("Electron API not available after waiting");
          setLoading(false);
        }
        return;
      }

      try {
        if (cancelled) return;

        let initialPath: string;
        let volumeUUID: string | null = null;

        if (autoNavigateToCard) {
          // Check for existing SD/CF cards first with timeout
          const cardsResultPromise = window.electron.fs.getSDCFCards();
          const timeoutPromise = new Promise((_, reject) => {
            const timeout = setTimeout(() => reject(new Error("getSDCFCards timeout")), 5000);
            timeouts.push(timeout);
          });

          let cardsResult;
          try {
            cardsResult = (await Promise.race([cardsResultPromise, timeoutPromise])) as Awaited<
              ReturnType<typeof window.electron.fs.getSDCFCards>
            >;
          } catch (error) {
            console.error(`${paneName} - Error or timeout getting cards:`, error);
            cardsResult = { success: false, error: String(error) };
          }

          console.log(`${paneName} - Cards detection result:`, cardsResult);
          if (cardsResult.success && cardsResult.data && cardsResult.data.length > 0) {
            // Navigate to the first detected card
            const cardInfo = cardsResult.data[0];
            const cardPath = cardInfo.path;
            const cardUUID = cardInfo.uuid;
            console.log(
              `${paneName} - SD/CF card already mounted at startup, navigating to:`,
              cardPath,
              "UUID:",
              cardUUID,
            );

            setRootPath(cardPath);
            setIsCardMounted(true);
            setCurrentVolumeUUID(cardUUID);
            rootPathRef.current = cardPath;
            volumeUUID = cardUUID;

            // Try to restore saved navigation state
            initialPath = cardPath;
            const savedState = getNavigationState(cardUUID);
            console.log(`${paneName} - Checking saved state for card UUID:`, cardUUID, "savedState:", savedState);

            if (savedState && savedState.currentPath) {
              // Verify the saved path still exists and is accessible
              try {
                console.log(`${paneName} - Verifying saved path exists:`, savedState.currentPath);
                const statsResult = await window.electron.fs.getFileStats(savedState.currentPath);
                console.log(`${paneName} - Stats result:`, statsResult);

                if (statsResult.success && statsResult.data?.isDirectory) {
                  initialPath = savedState.currentPath;
                  console.log(
                    `${paneName} - Restored navigation state for card UUID:`,
                    cardUUID,
                    "to:",
                    savedState.currentPath,
                  );
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
        }

        // Fallback to home directory (when no card detected or autoNavigateToCard is false)
        console.log(`${paneName} - No card detected or not auto-navigating, falling back to home directory`);
        const homeResult = await window.electron.fs.getHomeDirectory();
        console.log(`${paneName} - Home directory result:`, homeResult);
        if (homeResult.success && homeResult.data) {
          const homePath = homeResult.data;
          setRootPath(homePath);
          setIsCardMounted(false); // Ensure card mounted state is false when using home directory
          rootPathRef.current = homePath;

          // Get volume UUID for home directory
          volumeUUID = await getVolumeUUIDForPath(homePath);
          setCurrentVolumeUUID(volumeUUID);

          // Try to restore saved navigation state for home volume
          initialPath = homePath;
          if (volumeUUID) {
            const savedState = getNavigationState(volumeUUID);
            if (savedState) {
              // Verify the saved path still exists and is accessible
              try {
                if (window.electron) {
                  const statsResult = await window.electron.fs.getFileStats(savedState.currentPath);
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

    // Listen for SD card detection events (only if autoNavigateToCard is enabled)
    if (autoNavigateToCard && window.electron?.on) {
      const handleCardDetected = async (cardPath: string, cardUUID: string) => {
        console.log(`${paneName} - SD/CF card detected, navigating to:`, cardPath, "UUID:", cardUUID);

        setRootPath(cardPath);
        setIsCardMounted(true);
        setCurrentVolumeUUID(cardUUID);
        rootPathRef.current = cardPath;

        // Try to restore saved navigation state
        let initialPath = cardPath;
        const savedState = getNavigationState(cardUUID);
        if (savedState) {
          // Verify the saved path still exists and is accessible
          try {
            const statsResult = await window.electron?.fs.getFileStats(savedState.currentPath);
            if (statsResult?.success && statsResult.data?.isDirectory) {
              initialPath = savedState.currentPath;
              console.log(
                `${paneName} - Restored navigation state for card UUID:`,
                cardUUID,
                "to:",
                savedState.currentPath,
              );
            } else {
              console.log(`${paneName} - Saved path exists but is not a directory, using card root`);
            }
          } catch {
            console.log(`${paneName} - Saved path no longer exists, using card root`);
          }
        } else {
          console.log(`${paneName} - No saved navigation state found for card UUID:`, cardUUID);
        }

        setCurrentRootPath(initialPath);
        currentRootPathRef.current = initialPath;
        setExpandedFolders(new Set());
        setFileTree([]);
        await loadDirectory(initialPath, "root");

        // Restore expanded folders after loading
        if (savedState?.expandedFolders && savedState.expandedFolders.length > 0) {
          setPendingExpandedFolders(savedState.expandedFolders);
        }
      };

      const handleCardRemoved = async (cardPath: string, cardUUID: string) => {
        console.log(`${paneName} - SD/CF card removed:`, cardPath, "UUID:", cardUUID);
        // Check if we need to navigate away using refs
        if (rootPathRef.current === cardPath || currentRootPathRef.current === cardPath) {
          try {
            const homeResult = await window.electron?.fs.getHomeDirectory();
            if (homeResult?.success && homeResult.data) {
              const homePath = homeResult.data;
              const volumeUUID = await getVolumeUUIDForPath(homePath);
              setCurrentVolumeUUID(volumeUUID);
              setRootPath(homePath);
              rootPathRef.current = homePath;

              // Try to restore saved navigation state
              let initialPath = homePath;
              if (volumeUUID) {
                const savedState = getNavigationState(volumeUUID);
                if (savedState) {
                  try {
                    if (window.electron) {
                      const statsResult = await window.electron.fs.getFileStats(savedState.currentPath);
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
            }
          } catch (error) {
            console.error(`${paneName} - Error handling card removal:`, error);
          }
        }
      };

      if (window.electron) {
        window.electron.on.sdCardDetected(handleCardDetected);
        window.electron.on.sdCardRemoved(handleCardRemoved);
      }
    }

    // Cleanup function
    return () => {
      cancelled = true;
      timeouts.forEach((timeout) => clearTimeout(timeout));
      if (autoNavigateToCard && window.electron?.removeListener) {
        window.electron.removeListener("sd-card-detected");
        window.electron.removeListener("sd-card-removed");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoNavigateToCard, loadDirectory, paneName]);
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

    if (!destinationPath || typeof destinationPath !== "string" || destinationPath.trim() === "") {
      console.error("No destination path available or invalid:", destinationPath);
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
        // Check if file conversion is needed
        // Only convert if convertFiles is enabled AND source is from a different pane
        const isFromDifferentPane = rootPath ? !sourcePath.startsWith(rootPath) : false;
        const isAudioFile = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac)$/i.test(sourcePath);

        // Determine destination file path - if fileFormat is WAV, change extension to .wav
        let finalDestFilePath = destFilePath;
        if (convertFiles && isFromDifferentPane && isAudioFile && fileFormat === "WAV") {
          finalDestFilePath = destFilePath.replace(/\.\w+$/i, ".wav");
        }

        const needsConversion =
          convertFiles &&
          isFromDifferentPane &&
          isAudioFile &&
          (fileFormat === "WAV" || sampleRate !== "dont-change" || sampleDepth === "16-bit" || mono || normalize);

        let result;
        if (needsConversion) {
          result = await window.electron.fs.convertAndCopyFile(
            sourcePath,
            finalDestFilePath,
            sampleRate !== "dont-change" ? (sampleRate === "44.1" ? 44100 : undefined) : undefined,
            sampleDepth,
            fileFormat,
            mono,
            normalize,
          );
        } else {
          result = await window.electron.fs.copyFile(sourcePath, destFilePath);
        }

        if (result.success) {
          // Refresh the destination folder
          const nodeId = destinationNode ? destinationNode.id : "root";
          await loadDirectory(destinationPath, nodeId);
          onFileTransfer?.(sourcePath, destinationPath);
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
          onFileTransfer?.(sourcePath, destinationPath);
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

  const handleDelete = async (node: FileNode) => {
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
        console.error(`Failed to delete ${itemType}:`, result.error);
        alert(`Failed to delete ${itemType}: ${result.error}`);
      }
    } catch (error) {
      console.error(`Error deleting ${itemType}:`, error);
      alert(`Error deleting ${itemType}: ${error}`);
    }
  };

  const handleEject = async () => {
    if (!isCardMounted || !window.electron || !rootPath) return;

    try {
      console.log(`${paneName} - Ejecting volume:`, rootPath);
      const ejectResult = await window.electron.fs.ejectVolume(rootPath);

      if (!ejectResult.success) {
        console.error("Failed to eject volume:", ejectResult.error);
        alert(`Failed to eject card: ${ejectResult.error}`);
        return;
      }

      // Then navigate back to home directory
      const homeResult = await window.electron.fs.getHomeDirectory();
      if (homeResult?.success && homeResult.data) {
        const homePath = homeResult.data;
        const volumeUUID = await getVolumeUUIDForPath(homePath);
        setCurrentVolumeUUID(volumeUUID);
        setRootPath(homePath);
        rootPathRef.current = homePath;

        // Try to restore saved navigation state
        let initialPath = homePath;
        if (volumeUUID) {
          const savedState = getNavigationState(volumeUUID);
          if (savedState) {
            try {
              const statsResult = await window.electron.fs.getFileStats(savedState.currentPath);
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
      }
    } catch (error) {
      console.error(`${paneName} - Error ejecting card:`, error);
      alert(`Error ejecting card: ${error}`);
    }
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !window.electron) return;

    try {
      const folderPath = joinPath(currentRootPath || rootPath, newFolderName.trim());
      const result = await window.electron.fs.createFolder(folderPath);

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
      <div className="p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h2>
          {showEjectButton && (
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
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 w-48"
            />
          </div>
          {showNewFolderButton && (
            <Button size="sm" variant="secondary" className="gap-2" onClick={() => setNewFolderDialogOpen(true)}>
              <FolderPlus className="w-4 h-4" />
              New Folder
            </Button>
          )}
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
              {pathDoesNotExist ? (
                <div className="space-y-3">
                  <div className="text-amber-600 dark:text-amber-500">
                    Directory does not exist: {currentRootPath || rootPath}
                  </div>
                  <Button size="sm" variant="outline" onClick={navigateToNearestExistingParent} className="gap-2">
                    <ArrowUp className="w-4 h-4" />
                    Navigate to Nearest Existing Parent
                  </Button>
                </div>
              ) : (
                <div className="text-muted-foreground">No files found</div>
              )}
            </div>
          ) : (
            renderFileTree(filteredFileSystem)
          )}
        </div>
      </ScrollArea>

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
