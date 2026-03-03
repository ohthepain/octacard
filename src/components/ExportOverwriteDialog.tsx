import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type ExportOverwriteChoice = "abort" | "overwrite" | "saveAs";

interface ExportOverwriteDialogProps {
  open: boolean;
  fileName: string;
  onChoice: (choice: ExportOverwriteChoice) => void;
}

export function ExportOverwriteDialog({
  open,
  fileName,
  onChoice,
}: ExportOverwriteDialogProps) {
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
          <DialogTitle>Overwrite File?</DialogTitle>
          <DialogDescription>
            <span className="font-mono break-all">{fileName}</span> already exists. Overwrite it or choose a different
            save location?
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onChoice("abort")}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => onChoice("saveAs")}>
            Choose location…
          </Button>
          <Button variant="destructive" onClick={() => onChoice("overwrite")}>
            Overwrite
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
