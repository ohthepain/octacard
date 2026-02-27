import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type OverwriteChoice = "abort" | "skip-all" | "continue";

interface OverwriteConfirmDialogProps {
  open: boolean;
  onChoice: (choice: OverwriteChoice) => void;
}

export function OverwriteConfirmDialog({ open, onChoice }: OverwriteConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onChoice("abort");
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Overwrite Existing Files?</DialogTitle>
          <DialogDescription>
            Some files already exist in the destination. Choose how to handle all overwrite conflicts for this operation.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="destructive" onClick={() => onChoice("abort")}>
            Abort
          </Button>
          <Button variant="outline" onClick={() => onChoice("skip-all")}>
            Skip All Overwrites
          </Button>
          <Button onClick={() => onChoice("continue")}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
