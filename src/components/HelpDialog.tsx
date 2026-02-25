import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HelpCircle } from "lucide-react";
import { useEffect } from "react";
import { capture } from "@/lib/analytics";

interface HelpDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const HelpDialog = ({ open, onOpenChange }: HelpDialogProps) => {
  useEffect(() => {
    if (!open) return;
    capture("octacard_dialog_opened", { dialog_name: "help" });
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && open) {
          capture("octacard_dialog_closed", { dialog_name: "help" });
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HelpCircle className="w-5 h-5" />
            Help
          </DialogTitle>
        </DialogHeader>
        <DialogDescription className="pt-2">
          How to use tempo detection and conversion in OctaCard.
        </DialogDescription>
        <div className="pt-2 space-y-4 text-sm">
          <div>
            <div className="font-semibold text-foreground mb-1">Tempo Detection</div>
            <div className="text-muted-foreground space-y-1">
              <p>
                When you select a target tempo in Format → Tempo, OctaCard detects the source BPM from your file paths:
              </p>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>First, it checks the <strong>filename</strong></li>
                <li>If no BPM is found, it checks the <strong>immediate parent folder name</strong></li>
              </ol>
              <p className="mt-2">
                Only the immediate parent folder is checked when the filename has no BPM.
              </p>
            </div>
          </div>

          <div>
            <div className="font-semibold text-foreground mb-1">Supported Patterns</div>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>Number at start: <code className="bg-muted px-1 rounded">120_kick.wav</code></li>
              <li>Preceded by underscore: <code className="bg-muted px-1 rounded">kick_120.wav</code></li>
              <li>Followed by bpm or _bpm: <code className="bg-muted px-1 rounded">120bpm.wav</code> or <code className="bg-muted px-1 rounded">120_bpm.wav</code></li>
              <li>At end before extension: <code className="bg-muted px-1 rounded">kick_120.wav</code></li>
            </ul>
          </div>

          <div>
            <div className="font-semibold text-foreground mb-1">BPM Range</div>
            <div className="text-muted-foreground">
              Only BPM values between 50 and 240 are recognized. Numbers outside this range are ignored.
            </div>
          </div>

          <div>
            <div className="font-semibold text-foreground mb-1">Renaming</div>
            <div className="text-muted-foreground space-y-1">
              <p>
                When tempo conversion is applied, the output path is updated to reflect the new BPM:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong>BPM from filename:</strong> The filename is updated (e.g. <code className="bg-muted px-1 rounded">120_kick.wav</code> → <code className="bg-muted px-1 rounded">140_kick.wav</code>)</li>
                <li><strong>BPM from folder:</strong> The folder segment containing the BPM is updated; the filename stays the same</li>
              </ul>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
