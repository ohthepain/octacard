import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { capture } from "@/lib/analytics";
import { HelpCircle } from "lucide-react";

const BPM_MIN = 50;
const BPM_MAX = 240;

export interface FormatSettings {
  fileFormat: string;
  sampleRate: string;
  sampleDepth: string;
  pitch: string;
  mono: boolean;
  normalize: boolean;
  trim: boolean;
  tempo: string;
}

interface TempoChooseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentTempo: string;
  onConfirm: (bpm: number) => void;
}

function TempoChooseDialog({
  open,
  onOpenChange,
  currentTempo,
  onConfirm,
}: TempoChooseDialogProps) {
  const [inputValue, setInputValue] = useState(
    currentTempo !== "dont-change" ? currentTempo : "120"
  );
  const [error, setError] = useState<string | null>(null);

  const handleOk = () => {
    const n = parseInt(inputValue, 10);
    if (!Number.isFinite(n) || n < BPM_MIN || n > BPM_MAX) {
      setError(`Enter a number between ${BPM_MIN} and ${BPM_MAX}`);
      return;
    }
    setError(null);
    onConfirm(n);
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setError(null);
    setInputValue(currentTempo !== "dont-change" ? currentTempo : "120");
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Choose Tempo (BPM)</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="tempo-bpm">BPM (50–240)</Label>
            <Input
              id="tempo-bpm"
              type="number"
              min={BPM_MIN}
              max={BPM_MAX}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleOk()}
            />
            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleOk}>OK</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface FormatDropdownProps {
  settings: FormatSettings;
  onSettingsChange: (settings: FormatSettings) => void;
}

export function FormatDropdown({ settings, onSettingsChange }: FormatDropdownProps) {
  const [tempoChooseOpen, setTempoChooseOpen] = useState(false);

  return (
    <>
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          Format
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Format</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={settings.fileFormat}
              onValueChange={(v) =>
                onSettingsChange({ ...settings, fileFormat: v })
              }
            >
              <DropdownMenuRadioItem value="dont-change">
                Don&apos;t change
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="WAV">WAV</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Sample Rate</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={settings.sampleRate}
              onValueChange={(v) =>
                onSettingsChange({ ...settings, sampleRate: v })
              }
            >
              <DropdownMenuRadioItem value="dont-change">
                Don&apos;t change
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="44100">44100</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="48000">48000</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Sample Depth</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={settings.sampleDepth}
              onValueChange={(v) =>
                onSettingsChange({ ...settings, sampleDepth: v })
              }
            >
              <DropdownMenuRadioItem value="dont-change">
                Don&apos;t change
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="16-bit">16-bit</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Pitch</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={settings.pitch}
              onValueChange={(v) =>
                onSettingsChange({ ...settings, pitch: v })
              }
            >
              <DropdownMenuRadioItem value="dont-change">
                Don&apos;t change
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="C">C</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Mono</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={settings.mono ? "yes" : "no"}
              onValueChange={(v) =>
                onSettingsChange({ ...settings, mono: v === "yes" })
              }
            >
              <DropdownMenuRadioItem value="no">
                Don&apos;t change
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="yes">Convert to mono</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Normalize</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={settings.normalize ? "yes" : "no"}
              onValueChange={(v) =>
                onSettingsChange({ ...settings, normalize: v === "yes" })
              }
            >
              <DropdownMenuRadioItem value="no">
                Don&apos;t change
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="yes">Normalize</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Trim</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={settings.trim ? "yes" : "no"}
              onValueChange={(v) =>
                onSettingsChange({ ...settings, trim: v === "yes" })
              }
            >
              <DropdownMenuRadioItem value="no">
                Don&apos;t change
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="yes">Trim silence</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Tempo</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuRadioGroup
              value={
                settings.tempo === "dont-change"
                  ? "dont-change"
                  : settings.tempo || "dont-change"
              }
              onValueChange={(v) => {
                if (v !== "choose") {
                  onSettingsChange({ ...settings, tempo: v });
                }
              }}
            >
              <DropdownMenuRadioItem value="dont-change">
                Don&apos;t change
              </DropdownMenuRadioItem>
              {settings.tempo !== "dont-change" && settings.tempo && (
                <DropdownMenuRadioItem value={settings.tempo}>
                  {settings.tempo} BPM
                </DropdownMenuRadioItem>
              )}
            </DropdownMenuRadioGroup>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setTempoChooseOpen(true);
              }}
            >
              Choose...
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link
            to="/help"
            className="flex cursor-default items-center"
            onClick={() => capture("octacard_format_help_clicked", { source: "format_dropdown" })}
          >
            <HelpCircle className="mr-2 h-4 w-4" />
            Help
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <TempoChooseDialog
      open={tempoChooseOpen}
      onOpenChange={setTempoChooseOpen}
      currentTempo={settings.tempo}
      onConfirm={(bpm) => onSettingsChange({ ...settings, tempo: String(bpm) })}
    />
  </>
  );
}
