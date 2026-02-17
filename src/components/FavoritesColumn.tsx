import { Star, Trash2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useFavorites, type Favorite } from "@/hooks/use-favorites";
import { cn } from "@/lib/utils";

interface FavoritesColumnProps {
  paneType: "source" | "dest";
  volumeId: string;
  currentPath: string;
  onNavigate: (path: string) => void;
  onDropFolder?: (path: string, name: string) => void;
  title?: string;
}

export function FavoritesColumn({
  paneType,
  volumeId,
  currentPath,
  onNavigate,
  onDropFolder,
  title,
}: FavoritesColumnProps) {
  const { favorites, addFavorite, removeFavorite } = useFavorites(
    paneType,
    volumeId
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();

    // #region agent log
    fetch('http://127.0.0.1:7245/ingest/a31e75e3-8f4d-4254-8a14-777131006b0f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FavoritesColumn.tsx:handleDrop',message:'handleDrop fired',data:{types:e.dataTransfer.types,sourcePath:e.dataTransfer.getData("sourcePath"),sourceType:e.dataTransfer.getData("sourceType"),textPlain:e.dataTransfer.getData("text/plain"),volumeId,paneType},timestamp:Date.now(),hypothesisId:'H1,H2,H3'})}).catch(()=>{});
    // #endregion

    // Check for drag from our file browser (has sourcePath/sourceType)
    const sourcePath = e.dataTransfer.getData("sourcePath");
    const sourceType = e.dataTransfer.getData("sourceType");
    if (sourcePath && sourceType === "folder") {
      const name = sourcePath.split("/").filter(Boolean).pop() || sourcePath;
      addFavorite(sourcePath, name);
      onDropFolder?.(sourcePath, name);
      // #region agent log
      fetch('http://127.0.0.1:7245/ingest/a31e75e3-8f4d-4254-8a14-777131006b0f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FavoritesColumn.tsx:handleDrop',message:'addFavorite called (in-app path)',data:{sourcePath,name},timestamp:Date.now(),hypothesisId:'H4'})}).catch(()=>{});
      // #endregion
      return;
    }

    // Check for drag from OS (FileSystemDirectoryHandle)
    const items = e.dataTransfer.items;
    if (!items || items.length === 0) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind !== "file") continue;

      try {
        const handle = await (item as any).getAsFileSystemHandle?.();
        if (handle?.kind === "directory") {
          const dirHandle = handle as FileSystemDirectoryHandle;
          const path = await getPathFromHandle(dirHandle, paneType);
          // #region agent log
          fetch('http://127.0.0.1:7245/ingest/a31e75e3-8f4d-4254-8a14-777131006b0f',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'FavoritesColumn.tsx:handleDrop',message:'OS dir handle',data:{path,handleName:dirHandle.name},timestamp:Date.now(),hypothesisId:'H1,H4'})}).catch(()=>{});
          // #endregion
          if (path) {
            addFavorite(path, dirHandle.name);
            onDropFolder?.(path, dirHandle.name);
          }
        }
      } catch {
        // Ignore - may not be a directory
      }
    }
  };

  const label = title ?? (paneType === "source" ? "Source Favorites" : "Dest Favorites");

  return (
    <div
      className={cn(
        "w-full min-w-0 bg-muted border-border flex flex-col shrink-0 h-full overflow-hidden",
        paneType === "source" ? "border-r" : "border-l"
      )}
    >
      <div className="px-2 py-2 border-b border-border shrink-0">
        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </div>
      </div>
      <ScrollArea
        className="flex-1 h-full"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="p-2 space-y-0.5">
          {favorites.length === 0 ? (
            <div className="px-2 py-4 text-sm text-muted-foreground text-center border-2 border-dashed border-muted rounded-lg">
              No favorites. Drag a folder here to add.
            </div>
          ) : (
            favorites.map((favorite) => (
              <FavoriteItem
                key={favorite.path}
                favorite={favorite}
                isActive={currentPath === favorite.path}
                onNavigate={() => onNavigate(favorite.path)}
                onRemove={() => removeFavorite(favorite.path)}
              />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function FavoriteItem({
  favorite,
  isActive,
  onNavigate,
  onRemove,
}: {
  favorite: Favorite;
  isActive: boolean;
  onNavigate: () => void;
  onRemove: () => void;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          className={cn(
            "group flex items-center gap-2 px-2 py-1.5 rounded text-sm transition-colors cursor-pointer",
            isActive
              ? "bg-primary/10 text-primary font-medium"
              : "text-foreground hover:bg-muted/50"
          )}
        >
          <button
            type="button"
            onClick={onNavigate}
            className="flex items-center gap-2 flex-1 min-w-0 shrink-0 text-left"
          >
            <Star className="w-3 h-3 shrink-0 fill-current" />
            <span className="truncate">{favorite.name}</span>
          </button>
          <Button
            size="sm"
            variant="ghost"
            className="h-5 w-5 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            title="Remove from favorites"
          >
            <Trash2 className="w-3 h-3 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onNavigate}>Navigate to</ContextMenuItem>
        <ContextMenuItem
          onClick={onRemove}
          className="text-destructive focus:text-destructive"
        >
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/** Try to get path from a FileSystemDirectoryHandle - only works for handles under our root */
async function getPathFromHandle(
  handle: FileSystemDirectoryHandle,
  paneType: "source" | "dest"
): Promise<string | null> {
  try {
    const { fileSystemService } = await import("@/lib/fileSystem");
    return fileSystemService.getVirtualPath(handle, paneType);
  } catch {
    return null;
  }
}
