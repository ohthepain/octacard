import { ArrowLeft, Folder, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PackViewProps {
  name: string;
  coverImageUrl: string | null;
  creatorName?: string;
  onClose: () => void;
  isOwner?: boolean;
  onEdit?: () => void;
  /** Number of sample files in the pack */
  sampleCount?: number;
  /** Total size in bytes of sample files in the pack */
  totalSizeBytes?: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function PackView({
  name,
  coverImageUrl,
  creatorName,
  onClose,
  isOwner,
  onEdit,
  sampleCount,
  totalSizeBytes,
}: PackViewProps) {
  const statsText =
    sampleCount !== undefined && sampleCount >= 0
      ? totalSizeBytes !== undefined && totalSizeBytes > 0
        ? `${sampleCount} sample${sampleCount !== 1 ? "s" : ""} · ${formatSize(totalSizeBytes)}`
        : `${sampleCount} sample${sampleCount !== 1 ? "s" : ""}`
      : null;

  return (
    <div className="flex items-center gap-3 p-3 border-b border-border bg-card/50 shrink-0">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-8 w-8 p-0 shrink-0"
        onClick={onClose}
        aria-label="Close pack"
        title="Close pack"
      >
        <ArrowLeft className="w-4 h-4" />
      </Button>
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-20 h-20 rounded-md overflow-hidden bg-muted shrink-0 flex items-center justify-center">
          {coverImageUrl ? (
            <img
              src={coverImageUrl}
              alt=""
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : (
            <Folder className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {creatorName ? `by ${creatorName}` : "Pack"}
            {statsText && ` · ${statsText}`}
          </div>
        </div>
      </div>
      {isOwner && onEdit && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5"
          onClick={onEdit}
          aria-label="Edit pack"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
      )}
    </div>
  );
}
