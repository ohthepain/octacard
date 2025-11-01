import { useState, useEffect } from "react";
import { Folder, File, ChevronRight, ChevronDown, Search, HardDrive, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

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
}

export const FileBrowser = ({ onFileTransfer }: FileBrowserProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [rootPath, setRootPath] = useState<string>("");

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

  const handleDragStart = (e: React.DragEvent, node: FileNode) => {
    e.dataTransfer.setData("sourcePath", node.path);
    e.dataTransfer.setData("sourceType", node.type);
    e.dataTransfer.effectAllowed = "copy";
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
    return nodes.map((node) => {
      const isExpanded = expandedFolders.has(node.id);
      const hasChildren = node.children && node.children.length > 0;

      return (
        <div key={node.id}>
          <div
            draggable={node.type === "file" || node.type === "folder"}
            onDragStart={(e) => handleDragStart(e, node)}
            className="flex items-center gap-2 py-1.5 px-2 hover:bg-secondary/50 rounded cursor-pointer group"
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
            {node.size && (
              <span className="text-xs text-muted-foreground font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                {node.size}
              </span>
            )}
          </div>
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
        <div className="p-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : !window.electron ? (
            <div className="text-center py-8 text-sm text-red-500">
              Electron API not available. Please run in Electron environment.
            </div>
          ) : filteredFileSystem.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No files found</div>
          ) : (
            renderFileTree(filteredFileSystem)
          )}
        </div>
      </ScrollArea>

      {/* Status */}
      <div className="h-8 bg-toolbar border-t border-border px-4 flex items-center text-xs text-muted-foreground">
        <span className="font-mono">Drag files or folders to CF card →</span>
      </div>
    </div>
  );
};
