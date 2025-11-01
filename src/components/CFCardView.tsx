import { useState } from "react";
import { Folder, File, ChevronRight, ChevronDown, Trash2, FolderPlus } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface CFNode {
  id: string;
  name: string;
  type: "file" | "folder";
  path: string;
  children?: CFNode[];
  size?: string;
  format?: string;
}

// Mock CF card structure
const mockCFStructure: CFNode[] = [
  {
    id: "cf-1",
    name: "AUDIO",
    type: "folder",
    path: "/AUDIO",
    children: [
      {
        id: "cf-2",
        name: "Drums",
        type: "folder",
        path: "/AUDIO/Drums",
        children: [
          { id: "cf-3", name: "Kick_01.wav", type: "file", path: "/AUDIO/Drums/Kick_01.wav", size: "60KB", format: "WAV" },
          { id: "cf-4", name: "Snare.wav", type: "file", path: "/AUDIO/Drums/Snare.wav", size: "289KB", format: "WAV" },
        ],
      },
      {
        id: "cf-5",
        name: "Synths",
        type: "folder",
        path: "/AUDIO/Synths",
        children: [],
      },
    ],
  },
];

interface CFCardViewProps {
  onFileTransfer: (sourcePath: string, destinationPath: string) => void;
}

export const CFCardView = ({ onFileTransfer }: CFCardViewProps) => {
  const [cfStructure, setCFStructure] = useState<CFNode[]>(mockCFStructure);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["cf-1", "cf-2"]));
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
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

  const handleDrop = (e: React.DragEvent, destinationNode: CFNode) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverPath(null);

    if (destinationNode.type !== "folder") return;

    const sourcePath = e.dataTransfer.getData("sourcePath");
    const destinationPath = destinationNode.path;

    if (sourcePath && destinationPath) {
      onFileTransfer(sourcePath, destinationPath);
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
              isDragOver && node.type === "folder"
                ? "bg-primary/20 border border-primary"
                : "hover:bg-secondary/50"
            }`}
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => node.type === "folder" && toggleFolder(node.id)}
          >
            {node.type === "folder" ? (
              <>
                <span className="w-4 h-4 flex items-center justify-center">
                  {hasChildren || isExpanded ? (
                    isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    )
                  ) : null}
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
              <span className="text-xs text-muted-foreground font-mono">
                {node.size}
              </span>
            )}
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
          {node.type === "folder" && isExpanded && hasChildren && (
            <div>{renderCFTree(node.children!, depth + 1)}</div>
          )}
        </div>
      );
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          CF Card Structure
        </h2>
        <Button size="sm" variant="secondary" className="gap-2">
          <FolderPlus className="w-4 h-4" />
          New Folder
        </Button>
      </div>

      {/* CF Tree */}
      <ScrollArea className="flex-1">
        <div className="p-2">{renderCFTree(cfStructure)}</div>
      </ScrollArea>

      {/* Status */}
      <div className="h-8 bg-toolbar border-t border-border px-4 flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono">Drop files here to copy</span>
        <span>CF Card: 4.2 GB free</span>
      </div>
    </div>
  );
};
