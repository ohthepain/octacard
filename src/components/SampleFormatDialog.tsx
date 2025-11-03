import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

interface SampleFormatDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sampleRate: string;
  onSampleRateChange: (value: string) => void;
  sampleDepth: string;
  onSampleDepthChange: (value: string) => void;
  mono: boolean;
  onMonoChange: (checked: boolean) => void;
  normalize: boolean;
  onNormalizeChange: (checked: boolean) => void;
}

export const SampleFormatDialog = ({
  open,
  onOpenChange,
  sampleRate,
  onSampleRateChange,
  sampleDepth,
  onSampleDepthChange,
  mono,
  onMonoChange,
  normalize,
  onNormalizeChange,
}: SampleFormatDialogProps) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">S</span>
            </div>
            Sample Format
          </DialogTitle>
          <DialogDescription className="pt-4 space-y-6">
            <div className="space-y-3 p-4 border border-border rounded-lg">
              <Label className="text-sm font-semibold text-foreground">Sample Rate</Label>
              <RadioGroup value={sampleRate} onValueChange={onSampleRateChange}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="dont-change" id="dont-change" />
                  <Label
                    htmlFor="dont-change"
                    className="text-sm font-normal cursor-pointer text-foreground"
                  >
                    Don't Change
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="44.1" id="44.1" />
                  <Label
                    htmlFor="44.1"
                    className="text-sm font-normal cursor-pointer text-foreground"
                  >
                    44.1 kHz
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="space-y-3 p-4 border border-border rounded-lg">
              <Label className="text-sm font-semibold text-foreground">Sample Depth</Label>
              <RadioGroup value={sampleDepth} onValueChange={onSampleDepthChange}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="dont-change" id="depth-dont-change" />
                  <Label
                    htmlFor="depth-dont-change"
                    className="text-sm font-normal cursor-pointer text-foreground"
                  >
                    Don't Change
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="16-bit" id="16-bit" />
                  <Label
                    htmlFor="16-bit"
                    className="text-sm font-normal cursor-pointer text-foreground"
                  >
                    16-bit
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="mono"
                checked={mono}
                onCheckedChange={(checked) => onMonoChange(checked === true)}
              />
              <Label
                htmlFor="mono"
                className="text-sm font-normal cursor-pointer text-foreground"
              >
                Mono
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="normalize"
                checked={normalize}
                onCheckedChange={(checked) => onNormalizeChange(checked === true)}
              />
              <Label
                htmlFor="normalize"
                className="text-sm font-normal cursor-pointer text-foreground"
              >
                Normalize
              </Label>
            </div>
          </DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );
};

