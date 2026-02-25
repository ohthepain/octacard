import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useEffect, useRef } from "react";
import { capture } from "@/lib/analytics";

interface ConversionConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  fileCount: number;
  settings: {
    sampleRate: string;
    sampleDepth: string;
    fileFormat: string;
    pitch: string;
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
  const wasOpenRef = useRef(false);
  const hasConversion =
    settings.sampleRate !== "dont-change" ||
    settings.sampleDepth !== "dont-change" ||
    settings.fileFormat !== "dont-change" ||
    settings.pitch !== "dont-change" ||
    settings.mono ||
    settings.normalize ||
    settings.trimStart;

  const actionLabel = hasConversion ? "Convert & Save" : "Copy";
  const titleLabel = hasConversion ? "Convert Files?" : "Copy Files?";
  const descriptionLabel =
    fileCount === 1
      ? hasConversion
        ? "1 file will be converted and saved to the destination."
        : "1 file will be copied to the destination."
      : hasConversion
        ? `${fileCount} files will be converted and saved to the destination.`
        : `${fileCount} files will be copied to the destination.`;

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
    if (settings.pitch !== "dont-change") {
      parts.push(`Pitch: ${settings.pitch}`);
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

  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = open;
    if (open && !wasOpen) {
      capture("octacard_dialog_opened", {
        dialog_name: "conversion_confirm",
        file_count: fileCount,
        has_conversion: hasConversion,
        settings: {
          sampleRate: settings.sampleRate,
          sampleDepth: settings.sampleDepth,
          fileFormat: settings.fileFormat,
          pitch: settings.pitch,
          mono: settings.mono,
          normalize: settings.normalize,
          trimStart: settings.trimStart,
        },
      });
    }
  }, [open, fileCount, hasConversion, settings.sampleRate, settings.sampleDepth, settings.fileFormat, settings.mono, settings.normalize, settings.trimStart]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && open) {
          capture("octacard_dialog_closed", {
            dialog_name: "conversion_confirm",
            file_count: fileCount,
            has_conversion: hasConversion,
          });
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleLabel}</DialogTitle>
        </DialogHeader>
        <DialogDescription>{descriptionLabel}</DialogDescription>
        <div className="py-4">
          <div className="text-sm text-muted-foreground">
            <strong>Conversion Settings:</strong>
          </div>
          <div className="mt-2 text-sm">{formatSettings()}</div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              capture("octacard_dialog_cancelled", {
                dialog_name: "conversion_confirm",
                file_count: fileCount,
                has_conversion: hasConversion,
              });
              onOpenChange(false);
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={() => {
              capture("octacard_conversion_confirmed", {
                file_count: fileCount,
                has_conversion: hasConversion,
                settings: {
                  sampleRate: settings.sampleRate,
                  sampleDepth: settings.sampleDepth,
                  fileFormat: settings.fileFormat,
                  mono: settings.mono,
                  normalize: settings.normalize,
                  trimStart: settings.trimStart,
                },
              });
              onConfirm();
            }}
          >
            {actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
