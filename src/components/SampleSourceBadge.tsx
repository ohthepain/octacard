import { useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { Folder } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { getSample } from "@/lib/remote-library";
import { useNavigateRequestStore } from "@/stores/navigate-request-store";
import { isRemotePath, parseRemoteSampleId } from "@/lib/audio-resolver";
import type { PaneType } from "@/stores/multi-sample-store";
import { cn } from "@/lib/utils";

function dirname(path: string): string {
  const lastSlash = path.lastIndexOf("/");
  if (lastSlash <= 0) return "/";
  return path.slice(0, lastSlash);
}

export type SampleSource =
  | { type: "remote"; sampleId: string }
  | { type: "local"; path: string; paneType: PaneType };

interface SampleSourceBadgeProps {
  source: SampleSource;
  filename: string;
  size?: "sm" | "md";
  showFilename?: boolean;
  /** When true, render as Link for cross-page navigation (e.g. Admin -> Index) */
  useLink?: boolean;
  /** Pack ID for Link - only used when useLink and source is remote with pack */
  packId?: string;
  className?: string;
}

const ICON_SIZES = { sm: "w-4 h-4", md: "w-5 h-5" };
const CONTAINER_SIZES = { sm: "w-5 h-5", md: "w-6 h-6" };

export function SampleSourceBadge({
  source,
  filename,
  size = "md",
  showFilename = true,
  useLink = false,
  packId,
  className,
}: SampleSourceBadgeProps) {
  const requestNavigate = useNavigateRequestStore((s) => s.requestNavigate);

  const isRemote = source.type === "remote";
  const sampleId = isRemote ? source.sampleId : null;
  const { data: sampleData, isLoading } = useQuery({
    queryKey: ["sample", sampleId],
    queryFn: () => getSample(sampleId!),
    enabled: !!sampleId,
  });

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (source.type === "remote") {
        const id = sampleData?.packId;
        if (id) requestNavigate({ type: "pack", packId: id });
      } else {
        const folderPath = dirname(source.path);
        if (folderPath) requestNavigate({ type: "folder", path: folderPath, paneType: source.paneType });
      }
    },
    [source, sampleData?.packId, requestNavigate],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        if (source.type === "remote") {
          const id = sampleData?.packId;
          if (id) requestNavigate({ type: "pack", packId: id });
        } else {
          const folderPath = dirname(source.path);
          if (folderPath) requestNavigate({ type: "folder", path: folderPath, paneType: source.paneType });
        }
      }
    },
    [source, sampleData?.packId, requestNavigate],
  );

  const hasNavTarget =
    (source.type === "remote" && (sampleData?.packId ?? packId)) || source.type === "local";

  const iconContent =
    isRemote && sampleData ? (
      sampleData.coverImageProxyUrl ? (
        <img
          src={sampleData.coverImageProxyUrl}
          alt=""
          className={cn("w-full h-full object-cover rounded", CONTAINER_SIZES[size])}
          referrerPolicy="no-referrer"
        />
      ) : (
        <Folder className={cn("text-amber-600", ICON_SIZES[size])} />
      )
    ) : !isRemote ? (
      <Folder className={cn("text-amber-600", ICON_SIZES[size])} />
    ) : isLoading ? (
      <div className={cn("rounded bg-muted animate-pulse", CONTAINER_SIZES[size])} />
    ) : (
      <Folder className={cn("text-amber-600", ICON_SIZES[size])} />
    );

  const containerClass = cn(
    "shrink-0 rounded flex items-center justify-center overflow-hidden bg-muted",
    CONTAINER_SIZES[size],
    hasNavTarget && "cursor-pointer hover:ring-2 hover:ring-primary/50 transition-colors",
  );

  const displayFilename = isRemote && sampleData?.name ? sampleData.name : filename;

  const label = hasNavTarget
    ? source.type === "remote" && sampleData?.packName
      ? `Open pack: ${sampleData.packName}`
      : source.type === "local"
        ? "Open folder"
        : "Open pack"
    : "Sample source";

  if (useLink && isRemote && (packId ?? sampleData?.packId)) {
    const targetPackId = (packId ?? sampleData?.packId) as string;
    return (
      <Link
        to="/"
        search={{ openPack: targetPackId }}
        className={cn("flex items-center gap-1.5 min-w-0", className)}
        title={label}
        onClick={(e: React.MouseEvent) => e.stopPropagation()}
      >
        <span className={containerClass}>{iconContent}</span>
        {showFilename && (
          <span className="text-xs font-medium text-muted-foreground truncate" title={displayFilename}>
            {displayFilename}
          </span>
        )}
      </Link>
    );
  }

  if (hasNavTarget) {
    return (
      <div className={cn("flex items-center gap-1.5 min-w-0", className)}>
        <button
          type="button"
          className={containerClass}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          title={label}
          aria-label={label}
          tabIndex={0}
        >
          {iconContent}
        </button>
        {showFilename && (
          <span className="text-xs font-medium text-muted-foreground truncate" title={displayFilename}>
            {displayFilename}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-1.5 min-w-0", className)} title={displayFilename}>
      <span className={containerClass}>{iconContent}</span>
      {showFilename && (
        <span className="text-xs font-medium text-muted-foreground truncate">{displayFilename}</span>
      )}
    </div>
  );
}

/** Helper to create source from a stack sample path */
export function sampleSourceFromPath(
  path: string,
  paneType: PaneType,
): SampleSource {
  if (isRemotePath(path)) {
    const sampleId = parseRemoteSampleId(path);
    if (sampleId) return { type: "remote", sampleId };
  }
  return { type: "local", path, paneType };
}
