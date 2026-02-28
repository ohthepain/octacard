import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { capture } from "@/lib/analytics";
import { USER_SETTINGS_PRESET_LABEL, useFormatPresetStore } from "@/stores/format-preset-store";

const BPM_MIN = 50;
const BPM_MAX = 240;

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
    currentTempo !== "dont-change" ? currentTempo : "120",
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
            <Label htmlFor="tempo-bpm">BPM (50-240)</Label>
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
            {error && <p className="text-sm text-destructive">{error}</p>}
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

function BinaryRadioGroup({
  id,
  value,
  onValueChange,
  trueLabel,
}: {
  id: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
  trueLabel: string;
}) {
  return (
    <RadioGroup
      id={id}
      value={value ? "yes" : "no"}
      onValueChange={(next) => onValueChange(next === "yes")}
      className="grid gap-2"
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value="no" id={`${id}-no`} />
        <Label htmlFor={`${id}-no`} className="font-normal">
          Don&apos;t change
        </Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem value="yes" id={`${id}-yes`} />
        <Label htmlFor={`${id}-yes`} className="font-normal">
          {trueLabel}
        </Label>
      </div>
    </RadioGroup>
  );
}

export function FormatDropdown() {
  const [open, setOpen] = useState(false);
  const [tempoChooseOpen, setTempoChooseOpen] = useState(false);
  const settings = useFormatPresetStore((s) => s.currentPreset.settings);
  const selectedPresetId = useFormatPresetStore((s) => s.selectedPresetId);
  const devicePresets = useFormatPresetStore((s) => s.devicePresets);
  const updateCurrentPreset = useFormatPresetStore((s) => s.updateCurrentPreset);
  const applyDevicePreset = useFormatPresetStore((s) => s.applyDevicePreset);
  const selectedPresetLabel =
    selectedPresetId === "current"
      ? USER_SETTINGS_PRESET_LABEL
      : devicePresets.find((preset) => preset.id === selectedPresetId)?.name ?? USER_SETTINGS_PRESET_LABEL;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            aria-label="Format"
          >
            {selectedPresetLabel}
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Format Settings</DialogTitle>
            <DialogDescription>
              Configure all conversion settings in one place and optionally start from a device preset.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 py-2">
            <div className="grid gap-2">
              <Label htmlFor="format-preset">Preset</Label>
              <select
                id="format-preset"
                data-testid="format-preset-select"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                value={selectedPresetId}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === "current") {
                    return;
                  }
                  applyDevicePreset(value);
                }}
              >
                <option value="current">{USER_SETTINGS_PRESET_LABEL}</option>
                {devicePresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2 rounded-md border p-3">
                <Label className="font-semibold">Format</Label>
                <RadioGroup
                  value={settings.fileFormat}
                  onValueChange={(value: "dont-change" | "WAV") => updateCurrentPreset({ fileFormat: value })}
                  className="grid gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="dont-change" id="file-format-dont-change" />
                    <Label htmlFor="file-format-dont-change" className="font-normal">
                      Don&apos;t change
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="WAV" id="file-format-wav" />
                    <Label htmlFor="file-format-wav" className="font-normal">
                      WAV
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid gap-2 rounded-md border p-3">
                <Label className="font-semibold">Sample Rate</Label>
                <RadioGroup
                  value={settings.sampleRate}
                  onValueChange={(value: "dont-change" | "31250" | "44100" | "48000") =>
                    updateCurrentPreset({ sampleRate: value })
                  }
                  className="grid gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="dont-change" id="sample-rate-dont-change" />
                    <Label htmlFor="sample-rate-dont-change" className="font-normal">
                      Don&apos;t change
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="31250" id="sample-rate-31250" />
                    <Label htmlFor="sample-rate-31250" className="font-normal">
                      31250
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="44100" id="sample-rate-44100" />
                    <Label htmlFor="sample-rate-44100" className="font-normal">
                      44100
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="48000" id="sample-rate-48000" />
                    <Label htmlFor="sample-rate-48000" className="font-normal">
                      48000
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid gap-2 rounded-md border p-3">
                <Label className="font-semibold">Sample Depth</Label>
                <RadioGroup
                  value={settings.sampleDepth}
                  onValueChange={(value: "dont-change" | "16-bit") => updateCurrentPreset({ sampleDepth: value })}
                  className="grid gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="dont-change" id="sample-depth-dont-change" />
                    <Label htmlFor="sample-depth-dont-change" className="font-normal">
                      Don&apos;t change
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="16-bit" id="sample-depth-16-bit" />
                    <Label htmlFor="sample-depth-16-bit" className="font-normal">
                      16-bit
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid gap-2 rounded-md border p-3">
                <Label className="font-semibold">Pitch</Label>
                <RadioGroup
                  value={settings.pitch}
                  onValueChange={(value: "dont-change" | "C") => updateCurrentPreset({ pitch: value })}
                  className="grid gap-2"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="dont-change" id="pitch-dont-change" />
                    <Label htmlFor="pitch-dont-change" className="font-normal">
                      Don&apos;t change
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="C" id="pitch-c" />
                    <Label htmlFor="pitch-c" className="font-normal">
                      C
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="grid gap-2 rounded-md border p-3">
                <Label className="font-semibold">Mono</Label>
                <BinaryRadioGroup
                  id="mono"
                  value={settings.mono}
                  onValueChange={(mono) => updateCurrentPreset({ mono })}
                  trueLabel="Convert to mono"
                />
              </div>

              <div className="grid gap-2 rounded-md border p-3">
                <Label className="font-semibold">Normalize</Label>
                <BinaryRadioGroup
                  id="normalize"
                  value={settings.normalize}
                  onValueChange={(normalize) => updateCurrentPreset({ normalize })}
                  trueLabel="Normalize"
                />
              </div>

              <div className="grid gap-2 rounded-md border p-3">
                <Label className="font-semibold">Trim</Label>
                <BinaryRadioGroup
                  id="trim"
                  value={settings.trim}
                  onValueChange={(trim) => updateCurrentPreset({ trim })}
                  trueLabel="Trim silence"
                />
              </div>

              <div className="grid gap-2 rounded-md border p-3">
                <Label className="font-semibold">Filename</Label>
                <BinaryRadioGroup
                  id="sanitize-filename"
                  value={settings.sanitizeFilename}
                  onValueChange={(sanitizeFilename) => updateCurrentPreset({ sanitizeFilename })}
                  trueLabel="Sanitize filename"
                />
                <BinaryRadioGroup
                  id="shorten-filename"
                  value={settings.shortenFilename}
                  onValueChange={(shortenFilename) => updateCurrentPreset({ shortenFilename })}
                  trueLabel="Shorten filename"
                />
                <div className="grid gap-1">
                  <Label htmlFor="shorten-filename-max-length" className="font-normal text-xs text-muted-foreground">
                    Max length
                  </Label>
                  <Input
                    id="shorten-filename-max-length"
                    type="number"
                    min={8}
                    max={255}
                    value={settings.shortenFilenameMaxLength}
                    disabled={!settings.shortenFilename}
                    onChange={(e) => {
                      const numeric = Number.parseInt(e.target.value, 10);
                      if (Number.isFinite(numeric)) {
                        updateCurrentPreset({
                          shortenFilenameMaxLength: Math.min(255, Math.max(8, numeric)),
                        });
                      }
                    }}
                  />
                </div>
              </div>

              <div className="grid gap-2 rounded-md border p-3">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">Tempo</Label>
                  <span className="text-sm text-muted-foreground" data-testid="format-tempo-value">
                    {settings.tempo === "dont-change" ? "Don't change" : `${settings.tempo} BPM`}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setTempoChooseOpen(true)}>
                    Choose...
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => updateCurrentPreset({ tempo: "dont-change" })}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link
                to="/help"
                onClick={() => capture("octacard_format_help_clicked", { source: "format_dialog" })}
                className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
              >
                <HelpCircle className="mr-2 h-4 w-4" />
                Help
              </Link>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <TempoChooseDialog
        open={tempoChooseOpen}
        onOpenChange={setTempoChooseOpen}
        currentTempo={settings.tempo}
        onConfirm={(bpm) => updateCurrentPreset({ tempo: String(bpm) })}
      />
    </>
  );
}
