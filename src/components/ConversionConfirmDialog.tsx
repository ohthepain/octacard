import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ConversionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  fileCount: number;
  settings: {
    sampleRate: string;
    sampleDepth: string;
    fileFormat: string;
    mono: boolean;
    normalize: boolean;
    trimStart: boolean;
  };
}

export const ConversionConfirmDialog = ({
  open,
  onOpenChange,
  onConfirm,
  fileCount,
  settings,
}: ConversionConfirmDialogProps) => {
  const parseSampleRateToHz = (value: string): number | null => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      return null;
    }
    return Math.round(numericValue < 1000 ? numericValue * 1000 : numericValue);
  };

  const formatSettings = () => {
    const parts: string[] = [];
    
    if (settings.sampleRate !== "dont-change") {
      const hz = parseSampleRateToHz(settings.sampleRate);
      if (hz) {
        parts.push(`Sample Rate: ${hz >= 1000 ? hz / 1000 + " kHz" : hz + " Hz"}`);
      }
    }
    if (settings.sampleDepth !== "dont-change") {
      parts.push(`Bit Depth: ${settings.sampleDepth}`);
    }
    if (settings.fileFormat !== "dont-change") {
      parts.push(`Format: ${settings.fileFormat}`);
    }
    if (settings.mono) {
      parts.push("Mono");
    }
    if (settings.normalize) {
      parts.push("Normalize");
    }
    if (settings.trimStart) {
      parts.push("Trim Start");
    }
    
    return parts.length > 0 ? parts.join(", ") : "No conversion (copy only)";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convert Files?</DialogTitle>
        </DialogHeader>
        <DialogDescription>
          {fileCount === 1
            ? "1 file will be converted and saved to the destination."
            : `${fileCount} files will be converted and saved to the destination.`}
        </DialogDescription>
        <div className="py-4">
          <div className="text-sm text-muted-foreground">
            <strong>Conversion Settings:</strong>
          </div>
          <div className="mt-2 text-sm">{formatSettings()}</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Convert & Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
