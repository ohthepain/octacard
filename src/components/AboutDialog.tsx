import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AboutDialog = ({ open, onOpenChange }: AboutDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">O</span>
            </div>
            OctaCard
          </DialogTitle>
          <DialogDescription className="pt-4 space-y-4">
            <div>
              <div className="font-semibold text-foreground mb-1">Version 1.0.0</div>
              <div className="text-sm">
                Sample manager and organizer for Elektron Octatrack
              </div>
            </div>

            <div className="space-y-2 text-sm">
              <div className="font-semibold text-foreground">Features:</div>
              <ul className="list-disc list-inside space-y-1 text-muted-foreground">
                <li>Import and organize audio samples</li>
                <li>Auto-convert to Octatrack format (16-bit, 44.1kHz)</li>
                <li>Waveform preview and playback</li>
                <li>Drag-and-drop sample management</li>
                <li>Sample chain generation</li>
                <li>Export to CF card with proper structure</li>
              </ul>
            </div>

            <div className="pt-4 border-t border-border">
              <Button
                variant="outline"
                className="w-full gap-2"
                onClick={() => window.open("https://github.com/yourusername/octacard", "_blank")}
              >
                <ExternalLink className="w-4 h-4" />
                View on GitHub
              </Button>
            </div>

            <div className="text-xs text-muted-foreground pt-2">
              <strong>Note:</strong> This app uses the File System Access API for folder access. 
              Use a modern browser (Chrome, Edge) that supports folder access.
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
};
