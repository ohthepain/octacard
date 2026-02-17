import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface FormatSettings {
  fileFormat: string;
  sampleRate: string;
  sampleDepth: string;
  mono: boolean;
  normalize: boolean;
  trim: boolean;
}

interface FormatDropdownProps {
  settings: FormatSettings;
  onSettingsChange: (settings: FormatSettings) => void;
}

export function FormatDropdown({ settings, onSettingsChange }: FormatDropdownProps) {
  return (
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
