import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

export interface ExportMarkerOptions {
  embeddedMarkers: boolean;
  sliceFiles: boolean;
  ixmlMetadata: boolean;
}

const DEFAULT_OPTIONS: ExportMarkerOptions = {
  embeddedMarkers: true,
  sliceFiles: false,
  ixmlMetadata: true,
};

interface ExportOptionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: ExportMarkerOptions;
  onOptionsChange: (options: ExportMarkerOptions) => void;
  onConfirm: () => void;
}

export function ExportOptionsDialog({
  open,
  onOpenChange,
  options,
  onOptionsChange,
  onConfirm,
}: ExportOptionsDialogProps) {
  const setOption = <K extends keyof ExportMarkerOptions>(key: K, value: ExportMarkerOptions[K]) => {
    onOptionsChange({ ...options, [key]: value });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Options</DialogTitle>
          <DialogDescription>
            Slices detected. Choose how to export markers and metadata.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="embedded-markers"
              checked={options.embeddedMarkers}
              onCheckedChange={(c) => setOption("embeddedMarkers", !!c)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="embedded-markers" className="font-medium cursor-pointer">
                Embedded markers (recommended)
              </Label>
              <p className="text-sm text-muted-foreground">
                Write cue chunk and labels into the WAV file for DAW compatibility.
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <Checkbox
              id="ixml-metadata"
              checked={options.ixmlMetadata}
              onCheckedChange={(c) => setOption("ixmlMetadata", !!c)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="ixml-metadata" className="font-medium cursor-pointer">
                Tempo and time signature (iXML)
              </Label>
              <p className="text-sm text-muted-foreground">
                Add iXML chunk with BPM and time signature metadata.
              </p>
            </div>
          </div>
          <div className="flex items-start space-x-3">
            <Checkbox
              id="slice-files"
              checked={options.sliceFiles}
              onCheckedChange={(c) => setOption("sliceFiles", !!c)}
            />
            <div className="grid gap-1.5 leading-none">
              <Label htmlFor="slice-files" className="font-medium cursor-pointer">
                Slice files
              </Label>
              <p className="text-sm text-muted-foreground">
                Export each slice as a separate file (BaseName_01.wav, BaseName_02.wav, etc.) in a
                folder.
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Export</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { DEFAULT_OPTIONS };
