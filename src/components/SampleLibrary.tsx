import { useState } from "react";
import { FileAudio, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { WaveformPreview } from "@/components/WaveformPreview";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Sample {
  id: string;
  name: string;
  duration: string;
  format: string;
  sampleRate: string;
  bitDepth: string;
  size: string;
}

const mockSamples: Sample[] = [
  { id: "1", name: "Kick_01.wav", duration: "0:00.341", format: "WAV", sampleRate: "44.1kHz", bitDepth: "16-bit", size: "60KB" },
  { id: "2", name: "Snare_Acoustic.wav", duration: "0:01.203", format: "WAV", sampleRate: "48kHz", bitDepth: "24-bit", size: "289KB" },
  { id: "3", name: "HiHat_Closed.aiff", duration: "0:00.127", format: "AIFF", sampleRate: "44.1kHz", bitDepth: "16-bit", size: "22KB" },
  { id: "4", name: "Bass_Loop_120BPM.wav", duration: "0:08.000", format: "WAV", sampleRate: "44.1kHz", bitDepth: "16-bit", size: "1.4MB" },
  { id: "5", name: "Synth_Lead_C.wav", duration: "0:02.500", format: "WAV", sampleRate: "44.1kHz", bitDepth: "16-bit", size: "440KB" },
  { id: "6", name: "Perc_Shaker.wav", duration: "0:04.200", format: "WAV", sampleRate: "44.1kHz", bitDepth: "16-bit", size: "740KB" },
  { id: "7", name: "Vocal_Chop_01.aiff", duration: "0:01.800", format: "AIFF", sampleRate: "48kHz", bitDepth: "24-bit", size: "432KB" },
  { id: "8", name: "FX_Riser.wav", duration: "0:03.000", format: "WAV", sampleRate: "44.1kHz", bitDepth: "16-bit", size: "529KB" },
];

interface SampleLibraryProps {
  onSelectSample: (id: string) => void;
  selectedSample: string | null;
}

export const SampleLibrary = ({ onSelectSample, selectedSample }: SampleLibraryProps) => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSamples = mockSamples.filter(sample =>
    sample.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <h2 className="text-sm font-semibold mb-3 uppercase tracking-wide text-muted-foreground">
          Sample Library
        </h2>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search samples..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Sample List */}
      <ScrollArea className="flex-1">
        <div className="p-2">
          {filteredSamples.map((sample) => (
            <button
              key={sample.id}
              onClick={() => onSelectSample(sample.id)}
              className={`w-full text-left p-3 rounded mb-1 transition-colors ${
                selectedSample === sample.id
                  ? "bg-primary/20 border border-primary"
                  : "hover:bg-secondary border border-transparent"
              }`}
            >
              <div className="flex items-start gap-2">
                <FileAudio className="w-4 h-4 mt-1 text-primary flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{sample.name}</div>
                  <div className="text-xs text-muted-foreground font-mono mt-1">
                    {sample.duration} • {sample.format} • {sample.sampleRate} • {sample.bitDepth}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{sample.size}</div>
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>

      {/* Preview Section */}
      {selectedSample && (
        <div className="border-t border-border">
          <WaveformPreview sampleId={selectedSample} />
        </div>
      )}
    </div>
  );
};
