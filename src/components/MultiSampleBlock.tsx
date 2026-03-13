import { useRef, useEffect, useState } from "react";
import { X, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import WaveSurfer from "wavesurfer.js";
import { fileSystemService } from "@/lib/fileSystem";
import { ensureAudioDecodable } from "@/lib/audioConverter";
import { toast } from "sonner";
import { parseBpmFromString } from "@/lib/tempoUtils";
import { useMultiSampleStore } from "@/stores/multi-sample-store";
import { usePlayerStore } from "@/stores/player-store";
import type { StackSample, PaneType } from "@/stores/multi-sample-store";
import { useWaveformEditorStore } from "@/stores/waveform-editor-store";
import { cn } from "@/lib/utils";

const AUDIO_EXT = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i;
function isAudioFile(name: string): boolean {
  return AUDIO_EXT.test(name);
}

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
  isActive?: boolean;
  onRemove: () => void;
  onDropSample?: (sample: { path: string; name: string; paneType: PaneType }) => void;
  onClick?: () => void;
  className?: string;
}

export const MultiSampleBlock = ({ sample, index, isActive, onRemove, onDropSample, onClick, className }: MultiSampleBlockProps) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const updateSampleBars = useMultiSampleStore((s) => s.updateSampleBars);
  const setPlayingSamplePosition = useMultiSampleStore((s) => s.setPlayingSamplePosition);
  const playingSamplePosition = useMultiSampleStore((s) => s.playingSamplePosition);
  const playingSamplePositions = useMultiSampleStore((s) => s.playingSamplePositions);
  const playerMode = usePlayerStore((s) => s.mode);
  const singleFile = usePlayerStore((s) => s.singleFile);
  const playerCurrentTime = usePlayerStore((s) => s.currentTime);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setSampleVolume = useMultiSampleStore((s) => s.setSampleVolume);
  const setSampleMuted = useMultiSampleStore((s) => s.setSampleMuted);
  const volume = sample.volume ?? 1;
  const muted = sample.muted ?? false;

  const handleBlockClick = () => {
    useMultiSampleStore.getState().setActiveSlotIndex(index);
    onClick?.();
    useWaveformEditorStore.getState().openWithFileFromMulti(sample.path, sample.name, sample.paneType, sample.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (!onDropSample) return;

    const sourcePath = e.dataTransfer.getData("sourcePath");
    const sourceType = e.dataTransfer.getData("sourceType");
    const sourcePane = e.dataTransfer.getData("sourcePane") as PaneType | "";

    if (sourcePath && sourceType === "file" && sourcePane && isAudioFile(sourcePath.split("/").pop() || "")) {
      const name = sourcePath.split("/").filter(Boolean).pop() || sourcePath;
      onDropSample({ path: sourcePath, name, paneType: sourcePane as PaneType });
      return;
    }

    const items = e.dataTransfer.items;
    const item = items?.[0];
    if (item?.kind !== "file") return;

    const file = item.getAsFile();
    if (!file || !isAudioFile(file.name)) return;
    if (!fileSystemService.hasRootForPane("source")) {
      toast.error("Select a source folder first to add files from your computer");
      return;
    }
    void (async () => {
      const result = await fileSystemService.addFileFromDrop(file, "/", "source");
      if (result.success && result.data) {
        const path = result.data;
        const name = path.split("/").filter(Boolean).pop() || file.name;
        onDropSample({ path, name, paneType: "source" });
      } else {
        toast.error(result.error || "Failed to add file");
      }
    })();
  };

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

        const decodableUrl = await ensureAudioDecodable(result.data, sample.path);
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
        });

        wavesurfer.on("pause", () => {
          if (!cancelled) {
            const multiSampleId = useWaveformEditorStore.getState().multiSampleId;
            if (multiSampleId === sample.id) {
              setPlayingSamplePosition(null);
            }
          }
        });

        wavesurfer.on("error", (err) => {
          if (cancelled) return;
          if (err.name !== "AbortError" && !err.message?.includes("aborted")) {
            setErrorMessage(err.message || "Failed to load audio");
          }
          setIsLoading(false);
        });

        await wavesurfer.load(decodableUrl);
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
  }, [sample.path, sample.paneType, sample.name, sample.id, index, updateSampleBars, setPlayingSamplePosition, sample.bpm]);

  // Sync playhead from unified player: multi uses playingSamplePositions/playingSamplePosition, single uses playerCurrentTime when this sample matches
  const currentTime =
    playerMode === "single" && isPlaying && singleFile?.path === sample.path
      ? playerCurrentTime
      : playingSamplePositions[sample.id] ?? (playingSamplePosition?.sampleId === sample.id ? playingSamplePosition.currentTime : null);
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || currentTime == null) return;
    const dur = ws.getDuration();
    if (dur > 0) {
      const safeTime = Math.min(currentTime, dur * 0.9999);
      ws.seekTo(safeTime / dur);
    }
  }, [currentTime]);

  return (
    <div
      className={cn(
        "flex flex-col border border-border rounded-lg bg-card overflow-hidden transition-colors cursor-pointer",
        isDragOver && "border-primary bg-primary/5",
        isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleBlockClick}
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
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSampleMuted(index, !muted);
          }}
          className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer p-0.5 -m-0.5 rounded"
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? (
            <VolumeX className="w-3 h-3" />
          ) : (
            <Volume2 className="w-3 h-3" />
          )}
        </button>
        <Slider
          value={[volume]}
          max={1}
          step={0.01}
          onValueChange={(value) => {
            setSampleVolume(index, value[0]);
          }}
          className="cursor-pointer flex-1"
          data-testid={`volume-slider-${index}`}
        />
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
