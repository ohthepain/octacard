import { useState } from "react";
import { Folder, File, ChevronRight, ChevronDown, Search, HardDrive } from "lucide-react";
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
}

// Mock file system structure
const mockFileSystem: FileNode[] = [
  {
    id: "1",
    name: "My Computer",
    type: "folder",
    path: "/",
    children: [
      {
        id: "2",
        name: "Music",
        type: "folder",
        path: "/Music",
        children: [
          {
            id: "3",
            name: "Samples",
            type: "folder",
            path: "/Music/Samples",
            children: [
              { id: "4", name: "Kick_01.wav", type: "file", path: "/Music/Samples/Kick_01.wav", size: "60KB", format: "WAV" },
              { id: "5", name: "Snare_Acoustic.wav", type: "file", path: "/Music/Samples/Snare_Acoustic.wav", size: "289KB", format: "WAV" },
              { id: "6", name: "HiHat_Closed.aiff", type: "file", path: "/Music/Samples/HiHat_Closed.aiff", size: "22KB", format: "AIFF" },
            ],
          },
          {
            id: "7",
            name: "Loops",
            type: "folder",
            path: "/Music/Loops",
            children: [
              { id: "8", name: "Bass_Loop_120BPM.wav", type: "file", path: "/Music/Loops/Bass_Loop_120BPM.wav", size: "1.4MB", format: "WAV" },
              { id: "9", name: "Drum_Loop.wav", type: "file", path: "/Music/Loops/Drum_Loop.wav", size: "980KB", format: "WAV" },
            ],
          },
        ],
      },
      {
        id: "10",
        name: "Documents",
        type: "folder",
        path: "/Documents",
        children: [
          {
            id: "11",
            name: "Audio Projects",
            type: "folder",
            path: "/Documents/Audio Projects",
            children: [
              { id: "12", name: "Synth_Lead_C.wav", type: "file", path: "/Documents/Audio Projects/Synth_Lead_C.wav", size: "440KB", format: "WAV" },
            ],
          },
        ],
      },
    ],
  },
];

interface FileBrowserProps {
  onFileTransfer: (sourcePath: string, destinationPath: string) => void;
}

export const FileBrowser = ({ onFileTransfer }: FileBrowserProps) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(["1", "2", "3"]));

  const toggleFolder = (folderId: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId);
    } else {
      newExpanded.add(folderId);
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
            draggable
            onDragStart={(e) => handleDragStart(e, node)}
            className="flex items-center gap-2 py-1.5 px-2 hover:bg-secondary/50 rounded cursor-pointer group"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => node.type === "folder" && toggleFolder(node.id)}
          >
            {node.type === "folder" ? (
              <>
                {hasChildren && (
                  <span className="w-4 h-4 flex items-center justify-center">
                    {isExpanded ? (
                      <ChevronDown className="w-3 h-3 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-muted-foreground" />
                    )}
                  </span>
                )}
                {!hasChildren && <span className="w-4" />}
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

  const filteredFileSystem = filterNodes(mockFileSystem, searchQuery);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-3">
          <HardDrive className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Local Files
          </h2>
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
        <div className="p-2">{renderFileTree(filteredFileSystem)}</div>
      </ScrollArea>

      {/* Status */}
      <div className="h-8 bg-toolbar border-t border-border px-4 flex items-center text-xs text-muted-foreground">
        <span className="font-mono">Drag files or folders to CF card →</span>
      </div>
    </div>
  );
};
