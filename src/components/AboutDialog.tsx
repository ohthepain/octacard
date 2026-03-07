import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from "@tanstack/react-router";
import { ExternalLink, Sparkles } from "lucide-react";
import { useEffect } from "react";
import { capture } from "@/lib/analytics";
import packageJson from "../../package.json";
import { useReleaseTourStore } from "@/stores/release-tour-store";

interface AboutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const AboutDialog = ({ open, onOpenChange }: AboutDialogProps) => {
  const loadAndStart = useReleaseTourStore((s) => s.loadAndStart);

  const handleWhatsNew = async () => {
    onOpenChange(false);
    await loadAndStart();
  };

  const vibeCodingUrl = "/vibe-coding-rules.html";

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
            <img src="/favicon.png" alt="" className="w-8 h-8 dark:hidden" aria-hidden />
            <img src="/logo_white.png" alt="" className="w-8 h-8 hidden dark:block" aria-hidden />
            OctaCard
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="pt-2">Sample manager and organizer for Elektron Octatrack.</DialogDescription>
        <div className="pt-2 space-y-4">
          <div>
            <div className="font-semibold text-foreground mb-1">Version {packageJson.version}</div>
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
            <Button variant="outline" className="w-full gap-2" onClick={handleWhatsNew}>
              <Sparkles className="w-4 h-4" />
              What&apos;s new
            </Button>
            <Button variant="outline" className="w-full gap-2" asChild>
              <a href="https://github.com/ohthepain/octacard" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
                View on GitHub
              </a>
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" className="w-full" asChild>
                <Link to="/legal/terms">Terms of Service</Link>
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <Link to="/legal/privacy">Privacy Policy</Link>
              </Button>
              <Button variant="outline" className="w-full col-span-2 gap-2" asChild>
                <a href={vibeCodingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4" />
                  Vibe-coding rules
                </a>
              </Button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground pt-2 space-y-1">
            <div>
              <strong>Browser Compatibility:</strong> This app uses the File System Access API for folder browsing.
            </div>
            <div className="pt-1">
              ✅ <strong>Supported:</strong> Brave, Chrome, and Chromium-based browsers (including ChatGPT Atlas)
            </div>
            <div className="text-amber-600 dark:text-amber-500">
              ❌ <strong>Not Supported:</strong> Safari, Firefox, and other non-Chromium browsers
            </div>
          </div>

          <div className="pt-4 border-t border-border space-y-2">
            <div className="font-semibold text-foreground">Other projects from the community!</div>
            <Button variant="outline" className="w-full gap-2" asChild>
              <a
                href="https://github.com/davidferlay/octatrack-manager/releases"
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="w-4 h-4" />
                Octatrack Manager
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
