import { useRef, useEffect, useState } from "react";
import { X, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import WaveSurfer from "wavesurfer.js";
import { getAudioBlobForPath } from "@/lib/audio-resolver";
import { resolveFileDrop } from "@/lib/resolveFileDrop";
import { ensureAudioDecodable } from "@/lib/audioConverter";
import { toast } from "sonner";
import { parseBpmFromString } from "@/lib/tempoUtils";
import { useProjectStore } from "@/stores/project-store";
import { usePlayerStore } from "@/stores/player-store";
import type { StackSample, PaneType } from "@/stores/project-store";
import { useWaveformEditorStore } from "@/stores/waveform-editor-store";
import { SampleSourceBadge, sampleSourceFromPath } from "@/components/SampleSourceBadge";
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
  showVolumeOverlay?: boolean;
  onRemove: () => void;
  onDropSample?: (sample: { path: string; name: string; paneType: PaneType }) => void;
  onClick?: () => void;
  className?: string;
}

export const MultiSampleBlock = ({
  sample,
  index,
  isActive,
  showVolumeOverlay = false,
  onRemove,
  onDropSample,
  onClick,
  className,
}: MultiSampleBlockProps) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const updateSampleBars = useProjectStore((s) => s.updateSampleBars);
  const setPlayingSamplePosition = useProjectStore((s) => s.setPlayingSamplePosition);
  const playingSamplePosition = useProjectStore((s) => s.playingSamplePosition);
  const playingSamplePositions = useProjectStore((s) => s.playingSamplePositions);
  const playerMode = usePlayerStore((s) => s.mode);
  const singleFile = usePlayerStore((s) => s.singleFile);
  const playerCurrentTime = usePlayerStore((s) => s.currentTime);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const setSampleVolume = useProjectStore((s) => s.setSampleVolume);
  const setSampleMuted = useProjectStore((s) => s.setSampleMuted);
  const volume = sample.volume ?? 1;
  const muted = sample.muted ?? false;

  // During drag, use local state for display; persist to store on commit only (one undo step).
  const [localVolume, setLocalVolume] = useState<number | null>(null);
  const displayVolume = localVolume ?? volume;

  const userJustSetVolumeRef = useRef(false);
  const [sliderSyncKey, setSliderSyncKey] = useState(0);
  const prevVolumeRef = useRef(volume);
  if (prevVolumeRef.current !== volume && !userJustSetVolumeRef.current) {
    setSliderSyncKey((k) => k + 1);
    setLocalVolume(null);
  }
  prevVolumeRef.current = volume;
  useEffect(() => {
    if (!userJustSetVolumeRef.current) return;
    const id = setTimeout(() => {
      userJustSetVolumeRef.current = false;
    }, 150);
    return () => clearTimeout(id);
  });

  const handleBlockClick = () => {
    if (userJustSetVolumeRef.current) return;
    useProjectStore.getState().setActiveSlotIndex(index);
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

    const remoteItemsPayload = e.dataTransfer.getData("octacardRemoteItems");
    if (remoteItemsPayload) {
      try {
        const parsed = JSON.parse(remoteItemsPayload) as Array<{ kind: string; id: string; name: string }>;
        const sampleItem = Array.isArray(parsed) ? parsed.find((item) => item?.kind === "sample") : null;
        if (sampleItem?.id && sampleItem.name) {
          onDropSample({
            path: `remote://sample/${sampleItem.id}`,
            name: sampleItem.name,
            paneType: "source",
          });
          return;
        }
      } catch {
        // Not valid remote JSON, fall through
      }
    }

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
    void (async () => {
      const result = await resolveFileDrop(file, { paneType: "source" });
      if (result.success && result.path && result.name) {
        onDropSample({ path: result.path, name: result.name, paneType: "source" });
      } else {
        toast.error(result.error || "Failed to add file");
      }
    })();
  };

  useEffect(() => {
    let cancelled = false;

    async function loadAndInit() {
      try {
        const result = await getAudioBlobForPath(sample.path, sample.paneType);
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
          height: 50,
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
  }, [
    sample.path,
    sample.paneType,
    sample.name,
    sample.id,
    index,
    updateSampleBars,
    setPlayingSamplePosition,
    sample.bpm,
  ]);

  // Sync playhead from unified player: multi uses playingSamplePositions/playingSamplePosition, single uses playerCurrentTime when this sample matches
  const currentTime =
    playerMode === "single" && isPlaying && singleFile?.path === sample.path
      ? playerCurrentTime
      : (playingSamplePositions[sample.id] ??
        (playingSamplePosition?.sampleId === sample.id ? playingSamplePosition.currentTime : null));
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
        "relative flex flex-col border border-border rounded-sm bg-card overflow-hidden transition-colors cursor-pointer",
        isDragOver && "border-primary bg-primary/5",
        isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background",
        className,
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleBlockClick}
    >
      <div className="flex items-center justify-between px-2 py-0.5 border-b border-border shrink-0 gap-1">
        <SampleSourceBadge
          source={sampleSourceFromPath(sample.path, sample.paneType)}
          filename={sample.name}
          size="sm"
          showFilename={true}
          className="flex-1 min-w-0"
        />
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
      <div className="relative h-[50px] shrink-0">
        {errorMessage ? (
          <div className="p-2 text-xs text-destructive">{errorMessage}</div>
        ) : (
          <div className="absolute inset-0">
            <div ref={waveformRef} className="w-full h-full" />
            {showVolumeOverlay && (
              <div
                className="absolute inset-x-1.5 top-1 z-20 flex items-center gap-2 rounded-md border border-border bg-background/90 backdrop-blur-sm px-2 py-1"
                onClick={(e) => e.stopPropagation()}
                data-testid={`volume-overlay-${index}`}
              >
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    userJustSetVolumeRef.current = true;
                    setSampleMuted(index, !muted);
                  }}
                  className="shrink-0 text-muted-foreground hover:text-foreground cursor-pointer p-0.5 -m-0.5 rounded"
                  aria-label={muted ? "Unmute" : "Mute"}
                >
                  {muted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                </button>
                <Slider
                  key={`${sample.id}-sync-${sliderSyncKey}`}
                  value={[displayVolume]}
                  max={1}
                  step={0.01}
                  onValueChange={(value) => {
                    userJustSetVolumeRef.current = true;
                    setLocalVolume(value[0]);
                  }}
                  onValueCommit={(value) => {
                    setLocalVolume(null);
                    setSampleVolume(index, value[0]);
                  }}
                  className="cursor-pointer flex-1"
                  data-testid={`volume-slider-${index}`}
                />
              </div>
            )}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
