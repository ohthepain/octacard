import { ArrowLeft, Folder } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface PackViewProps {
  name: string;
  coverImageUrl: string | null;
  onClose: () => void;
}

export function PackView({ name, coverImageUrl, onClose }: PackViewProps) {
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
            <img src={coverImageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <Folder className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">{name}</div>
          <div className="text-xs text-muted-foreground">Pack</div>
        </div>
      </div>
    </div>
  );
}
