import { useRef, useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import WaveSurfer from "wavesurfer.js";
import { fileSystemService } from "@/lib/fileSystem";
import { parseBpmFromString } from "@/lib/tempoUtils";
import { useMultiSampleStore } from "@/stores/multi-sample-store";
import type { StackSample } from "@/stores/multi-sample-store";
import { cn } from "@/lib/utils";

const DEFAULT_BPM = 120;

function getBpmFromSample(name: string, path: string): number {
  const fromName = parseBpmFromString(name);
  if (fromName) return fromName.bpm;
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const parentFolder = parts[parts.length - 2];
    const fromFolder = parentFolder ? parseBpmFromString(parentFolder) : null;
    if (fromFolder) return fromFolder.bpm;
  }
  return DEFAULT_BPM;
}

interface MultiSampleBlockProps {
  sample: StackSample;
  index: number;
  onRemove: () => void;
  onRegisterPlay?: (sampleId: string, play: () => void) => void;
  className?: string;
}

export const MultiSampleBlock = ({ sample, index, onRemove, onRegisterPlay, className }: MultiSampleBlockProps) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const updateSampleBars = useMultiSampleStore((s) => s.updateSampleBars);

  useEffect(() => {
    let cancelled = false;

    async function loadAndInit() {
      try {
        const result = await fileSystemService.getAudioFileBlob(sample.path, sample.paneType);
        if (!result.success || !result.data) {
          setErrorMessage(result.error || "Failed to load audio");
          setIsLoading(false);
          return;
        }

        if (cancelled || !waveformRef.current) return;

        const wavesurfer = WaveSurfer.create({
          container: waveformRef.current,
          waveColor: "#E0E0E0",
          progressColor: "#FF764D",
          cursorColor: "#FF764D",
          barWidth: 2,
          barRadius: 2,
          barGap: 1,
          height: 60,
          backend: "MediaElement",
          mediaControls: false,
          interact: false,
        });

        wavesurferRef.current = wavesurfer;

        wavesurfer.on("ready", () => {
          if (cancelled) return;
          const duration = wavesurfer.getDuration();
          const bpm = sample.bpm ?? getBpmFromSample(sample.name, sample.path);
          const bars = (duration * bpm) / 240;
          updateSampleBars(index, bars, duration, bpm);
          const width = waveformRef.current?.clientWidth ?? 400;
          wavesurfer.zoom(Math.max(1, width / duration));
          setIsLoading(false);
          onRegisterPlay?.(sample.id, () => {
            wavesurfer.seekTo(0);
            wavesurfer.play();
          });
        });

        wavesurfer.on("error", (err) => {
          if (cancelled) return;
          if (err.name !== "AbortError" && !err.message?.includes("aborted")) {
            setErrorMessage(err.message || "Failed to load audio");
          }
          setIsLoading(false);
        });

        await wavesurfer.load(result.data);
      } catch (err) {
        if (!cancelled) {
          setErrorMessage(String(err));
          setIsLoading(false);
        }
      }
    }

    loadAndInit();

    return () => {
      cancelled = true;
      onRegisterPlay?.(sample.id, () => {});
      if (wavesurferRef.current) {
        try {
          wavesurferRef.current.pause();
          wavesurferRef.current.destroy();
        } catch {
          // ignore
        }
        wavesurferRef.current = null;
      }
    };
  }, [sample.path, sample.paneType, sample.name, index, updateSampleBars, onRegisterPlay]);

  return (
    <div
      className={cn(
        "flex flex-col border border-border rounded-lg bg-card overflow-hidden",
        className
      )}
    >
      <div className="flex items-center justify-between px-2 py-1 border-b border-border shrink-0">
        <span
          className="text-xs font-medium text-muted-foreground truncate flex-1 min-w-0"
          title={sample.name}
        >
          {sample.name}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0 shrink-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label="Remove from stack"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div className="flex-1 min-h-[60px] relative">
        {errorMessage ? (
          <div className="p-2 text-xs text-destructive">{errorMessage}</div>
        ) : (
          <>
            <div ref={waveformRef} className="w-full h-[60px]" />
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
