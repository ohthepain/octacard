import { Folder, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Bank {
  id: string;
  name: string;
  samples: string[];
}

const mockBanks: Bank[] = [
  { id: "1", name: "Bank A - Drums", samples: ["Kick_01.wav", "Snare_Acoustic.wav", "HiHat_Closed.aiff"] },
  { id: "2", name: "Bank B - Bass", samples: ["Bass_Loop_120BPM.wav"] },
  { id: "3", name: "Bank C - Synths", samples: ["Synth_Lead_C.wav", "FX_Riser.wav"] },
  { id: "4", name: "Bank D - Vocals", samples: ["Vocal_Chop_01.aiff"] },
];

export const ProjectWorkspace = () => {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Project: Untitled
        </h2>
        <Button size="sm" variant="secondary" className="gap-2">
          <Plus className="w-4 h-4" />
          New Bank
        </Button>
      </div>

      {/* Banks */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {mockBanks.map((bank) => (
            <div
              key={bank.id}
              className="bg-card border border-border rounded-lg overflow-hidden"
            >
              {/* Bank Header */}
              <div className="bg-secondary p-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Folder className="w-4 h-4 text-primary" />
                  <span className="font-medium text-sm">{bank.name}</span>
                  <span className="text-xs text-muted-foreground">
                    ({bank.samples.length} samples)
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 hover:bg-destructive/20 hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Sample Slots */}
              <div className="p-3 space-y-2">
                {bank.samples.map((sample, idx) => (
                  <div
                    key={idx}
                    className="bg-secondary/50 border border-border rounded p-2 text-sm flex items-center gap-2 hover:bg-secondary transition-colors cursor-move"
                    draggable
                  >
                    <span className="text-xs text-muted-foreground font-mono w-6">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1 truncate">{sample}</span>
                  </div>
                ))}

                {/* Empty slots */}
                {Array.from({ length: Math.max(0, 8 - bank.samples.length) }).map((_, idx) => (
                  <div
                    key={`empty-${idx}`}
                    className="border border-dashed border-border rounded p-2 text-sm text-muted-foreground/50 flex items-center gap-2"
                  >
                    <span className="text-xs font-mono w-6">
                      {String(bank.samples.length + idx + 1).padStart(2, '0')}
                    </span>
                    <span className="flex-1">Empty slot</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Status Bar */}
      <div className="h-8 bg-toolbar border-t border-border px-4 flex items-center justify-between text-xs text-muted-foreground">
        <span>Total: {mockBanks.reduce((acc, bank) => acc + bank.samples.length, 0)} samples</span>
        <span className="font-mono">Ready</span>
      </div>
    </div>
  );
};
