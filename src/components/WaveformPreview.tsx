import { Play, Pause } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface WaveformPreviewProps {
  sampleId: string;
}

export const WaveformPreview = ({ sampleId }: WaveformPreviewProps) => {
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 mb-3">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => setIsPlaying(!isPlaying)}
          className="w-8 h-8 p-0"
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Preview
        </span>
      </div>

      {/* Waveform Visualization */}
      <div className="h-20 bg-waveform-bg rounded border border-border relative overflow-hidden">
        <svg className="w-full h-full" preserveAspectRatio="none">
          {/* Generate waveform bars */}
          {Array.from({ length: 100 }).map((_, i) => {
            const height = Math.random() * 60 + 20;
            const y = (80 - height) / 2;
            return (
              <rect
                key={i}
                x={`${i}%`}
                y={y}
                width="0.8%"
                height={height}
                className="fill-waveform opacity-70"
              />
            );
          })}
        </svg>

        {/* Playhead */}
        {isPlaying && (
          <div className="absolute top-0 left-1/3 w-0.5 h-full bg-foreground animate-pulse" />
        )}
      </div>
    </div>
  );
};
