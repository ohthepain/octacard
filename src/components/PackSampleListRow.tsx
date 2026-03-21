import { FileAudio, MoreHorizontal, Play, Square } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PaneType } from "@/lib/fileSystem";
import { cn } from "@/lib/utils";
import { usePlayerStore } from "@/stores/player-store";

export function formatCredits(credits: number): string {
  return credits <= 0 ? "Free" : `${credits} cr`;
}

export function formatSampleSizeMb(bytes: number | null | undefined): string {
  if (bytes == null || bytes <= 0) return "";
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Join non-empty segments with " • " for the muted subtitle line under the sample name. */
export function joinSampleMetaLine(
  parts: Array<string | false | null | undefined>,
): string {
  return parts
    .filter((p): p is string => Boolean(p && String(p).trim()))
    .join(" • ");
}

export function PackSampleListPlayButton({
  path,
  paneType,
}: {
  path: string;
  paneType: PaneType;
  name: string;
}) {
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
      className="h-7 w-7 shrink-0 p-0"
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
      {isThisPlaying ? (
        <Square className="h-3.5 w-3.5" />
      ) : (
        <Play className="h-3.5 w-3.5" />
      )}
    </Button>
  );
}

export interface PackSampleListRowProps {
  name: string;
  /** Muted line under the title (e.g. pack • credits • size). */
  subtitle: string;
  playPath: string;
  paneType: PaneType;
  /** When false, the play control is hidden (e.g. non-audio or locked remote). */
  showPlay?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onActivate: () => void;
  /** Inserted between play and the ⋯ menu (e.g. “Add” for locked global samples). */
  trailingActions?: ReactNode;
  /** Children of `DropdownMenuContent` (menu items). */
  menuContent: ReactNode;
  dimmed?: boolean;
  className?: string;
}

/**
 * Shared sample row layout: name + meta line, play, optional trailing actions, ⋯ menu.
 * Used by global pack browsing (`RemoteFilePane`) and the project pack structure editor.
 */
export function PackSampleListRow({
  name,
  subtitle,
  playPath,
  paneType,
  showPlay = true,
  draggable = false,
  onDragStart,
  onActivate,
  trailingActions,
  menuContent,
  dimmed,
  className,
}: PackSampleListRowProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onActivate}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      className={cn(
        "flex w-full min-w-0 items-center justify-between gap-3 rounded-md px-2 py-2 text-left hover:bg-accent",
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
        dimmed && "opacity-70",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <FileAudio className="h-4 w-4 shrink-0 text-sky-600" />
        <div className="min-w-0 truncate">
          <div className="truncate text-sm">{name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {showPlay && (
          <PackSampleListPlayButton
            path={playPath}
            paneType={paneType}
            name={name}
          />
        )}
        {trailingActions}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 w-7 shrink-0 p-0"
              aria-label="Sample options"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">{menuContent}</DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
