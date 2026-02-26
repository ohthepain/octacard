import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { useEffect } from "react";
import { capture } from "@/lib/analytics";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AboutDialog = ({ open, onOpenChange }: AboutDialogProps) => {
  const termsUrl = "/terms-of-service.html";
  const privacyUrl = "/privacy-policy.html";

  useEffect(() => {
    if (!open) return;
    capture("octacard_dialog_opened", { dialog_name: "about" });
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && open) {
          capture("octacard_dialog_closed", { dialog_name: "about" });
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">O</span>
            </div>
            OctaCard
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="pt-2">Sample manager and organizer for Elektron Octatrack.</DialogDescription>
        <div className="pt-2 space-y-4">
          <div>
            <div className="font-semibold text-foreground mb-1">Version 1.0.0</div>
            <div className="text-sm text-muted-foreground">Sample manager and organizer for Elektron Octatrack</div>
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

          <div className="pt-4 border-t border-border space-y-2">
            <Button variant="outline" className="w-full gap-2" asChild>
              <a href="https://github.com/ohthepain/octacard" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
                View on GitHub
              </a>
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="w-full" asChild>
                <a href={termsUrl} target="_blank" rel="noopener noreferrer">
                  Terms of Service
                </a>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href={privacyUrl} target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </a>
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground pt-2 space-y-1">
            <div>
              <strong>Browser Compatibility:</strong> This app uses the File System Access API for folder browsing.
            </div>
            <div className="pt-1">
              ✅ <strong>Supported:</strong> Chrome, Edge, Opera, and other Chromium-based browsers
            </div>
            <div className="text-amber-600 dark:text-amber-500">
              ❌ <strong>Not Supported:</strong> Safari (does not support the File System Access API)
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
