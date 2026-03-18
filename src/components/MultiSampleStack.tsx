import { useState, useCallback, useEffect } from "react";
import { Play, Pause, Square, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore, EMPTY_SLOTS } from "@/stores/project-store";
import { useShallow } from "zustand/react/shallow";
import { useWaveformEditorStore } from "@/stores/waveform-editor-store";
import { usePlayerStore } from "@/stores/player-store";
import { MultiSampleBlock } from "@/components/MultiSampleBlock";
import { fileSystemService } from "@/lib/fileSystem";
import { getPackDownloadManifest } from "@/lib/remote-library";
import { resolveFileDrop } from "@/lib/resolveFileDrop";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
type DirectoryHandleWithEntries = FileSystemDirectoryHandle & {
  entries: () => AsyncIterable<[string, FileSystemHandle]>;
};

type DataTransferItemWithFileSystemHandle = DataTransferItem & {
  getAsFileSystemHandle?: () => Promise<FileSystemHandle | null>;
};

const AUDIO_EXT = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i;
function isAudioFile(name: string): boolean {
  return AUDIO_EXT.test(name);
}

interface EmptyBlockProps {
  slotIndex: number;
  isActive: boolean;
  onDrop?: (e: React.DragEvent) => void;
  onClick?: () => void;
}

function EmptyBlock({ slotIndex, isActive, onDrop, onClick }: EmptyBlockProps) {
  const [isDragOver, setIsDragOver] = useState(false);

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

  return (
    <div
      role="button"
      tabIndex={0}
      data-testid={`empty-slot-${slotIndex}`}
      className={cn(
        "flex flex-col items-center justify-center border border-dashed rounded-md min-h-[76px] text-muted-foreground transition-colors cursor-pointer",
        isDragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30",
        isActive && "ring-2 ring-primary ring-offset-2 ring-offset-background",
      )}
      aria-hidden
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick?.()}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        onDrop?.(e);
      }}
    >
      <span className="text-xs font-medium">Next sample</span>
      <svg
        className="w-full h-8 mt-2 px-4 opacity-50"
        viewBox="0 0 100 20"
        preserveAspectRatio="none"
        aria-label="Next sample"
      >
        {Array.from({ length: 20 }).map((_, i) => {
          const h = 4 + ((i * 7) % 9);
          const y = (20 - h) / 2;
          return <rect key={`${i}-${h}-${y}`} x={i * 5} y={y} width="3" height={h} className="fill-current" />;
        })}
      </svg>
    </div>
  );
}

interface MultiSampleStackProps {
  className?: string;
  rootReloadToken?: string;
}

export const MultiSampleStack = ({ className, rootReloadToken = "0:0" }: MultiSampleStackProps) => {
  const slots = useProjectStore(useShallow((s) => s.getActiveStack()?.slots ?? EMPTY_SLOTS));
  const activeSlotIndex = useProjectStore((s) => s.getActiveStack()?.activeSlotIndex ?? 0);
  const stack = useProjectStore(useShallow((s) => s.getActiveStackStack()));
  const setActiveSlotIndex = useProjectStore((s) => s.setActiveSlotIndex);
  const removeFromStack = useProjectStore((s) => s.removeFromStack);
  const addToStack = useProjectStore((s) => s.addToStack);
  const addSamplesToStack = useProjectStore((s) => s.addSamplesToStack);
  const replaceSampleAt = useProjectStore((s) => s.replaceSampleAt);
  const closeWaveform = useWaveformEditorStore((s) => s.close);
  const [volumeMode, setVolumeMode] = useState(false);

  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playMulti = usePlayerStore((s) => s.playMulti);
  const stop = usePlayerStore((s) => s.stop);
  const setActiveSample = usePlayerStore((s) => s.setActiveSample);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditable =
        tag === "input" || tag === "textarea" || tag === "select" || Boolean(target?.isContentEditable);
      if (isEditable) return;
      if (event.metaKey && event.key.toLowerCase() === "v") {
        event.preventDefault();
        setVolumeMode((previous) => !previous);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const togglePlay = useCallback(() => {
    if (stack.length === 0) return;
    const hasValidBars = stack.some((s) => s.bars != null && s.bars > 0);
    if (!hasValidBars) return;

    if (isPlaying) {
      stop();
      return;
    }

    playMulti(
      stack.map((s) => ({
        id: s.id,
        path: s.path,
        name: s.name,
        paneType: s.paneType,
        bpm: s.bpm,
        duration: s.duration,
      })),
    );
  }, [isPlaying, stack, stop, playMulti]);

  const handleEmptySlotClick = useCallback(
    (slotIndex: number) => {
      setActiveSlotIndex(slotIndex);
      closeWaveform();
    },
    [setActiveSlotIndex, closeWaveform],
  );

  const openWaveformForActiveSlot = useCallback(() => {
    const { slots, activeSlotIndex } = useProjectStore.getState().getActiveStack() ?? { slots: [], activeSlotIndex: 0 };
    const sample = slots[activeSlotIndex];
    if (sample) {
      setActiveSample(sample.id);
      useWaveformEditorStore.getState().openWithFileFromMulti(sample.path, sample.name, sample.paneType, sample.id);
    }
  }, [setActiveSample]);

  const handleMultiDrop = useCallback(
    async (e: React.DragEvent) => {
      const remoteItemsPayload = e.dataTransfer.getData("octacardRemoteItems");
      if (remoteItemsPayload) {
        try {
          const parsed = JSON.parse(remoteItemsPayload) as Array<{ kind: string; id: string; name: string }>;
          const validItems = Array.isArray(parsed)
            ? parsed.filter(
                (item): item is { kind: "sample" | "pack"; id: string; name: string } =>
                  Boolean(item) && (item.kind === "sample" || item.kind === "pack") && typeof item.id === "string" && typeof item.name === "string",
              )
            : [];
          if (validItems.length > 0) {
            const samples: Array<{ path: string; name: string; paneType: "source" }> = [];
            for (const item of validItems) {
              if (samples.length >= 8) break;
              if (item.kind === "sample") {
                samples.push({ path: `remote://sample/${item.id}`, name: item.name, paneType: "source" });
              } else {
                const manifest = await getPackDownloadManifest(item.id);
                const packSamples = manifest.samples
                  .slice(0, 8 - samples.length)
                  .map((s) => ({
                    path: `remote://sample/${s.id}` as const,
                    name: s.name,
                    paneType: "source" as const,
                  }));
                samples.push(...packSamples);
              }
            }
            const toAdd = samples.slice(0, 8);
            if (toAdd.length > 0) {
              addSamplesToStack(toAdd, 8);
              openWaveformForActiveSlot();
            }
            return;
          }
        } catch (err) {
          toast.error("Failed to add remote items", {
            description: err instanceof Error ? err.message : "Unknown error",
          });
          return;
        }
      }

      const sourcePath = e.dataTransfer.getData("sourcePath");
      const sourceType = e.dataTransfer.getData("sourceType");
      const sourcePane = e.dataTransfer.getData("sourcePane") as "source" | "dest" | "";

      if (sourcePath && sourcePane) {
        if (sourceType === "folder") {
          const result = await fileSystemService.listAudioFilesRecursively(sourcePath, sourcePane);
          if (result.success && result.data) {
            const samples = result.data.slice(0, 8).map((f) => ({
              path: f.path,
              name: f.name,
              paneType: sourcePane as "source" | "dest",
            }));
            addSamplesToStack(samples, 8);
            openWaveformForActiveSlot();
          }
        } else if (sourceType === "file" && isAudioFile(sourcePath.split("/").pop() || "")) {
          const name = sourcePath.split("/").filter(Boolean).pop() || sourcePath;
          addToStack({ path: sourcePath, name, paneType: sourcePane as "source" | "dest" });
          openWaveformForActiveSlot();
        }
        return;
      }

      const items = e.dataTransfer.items;
      if (!items?.length) return;

      const collectAudioFiles = async (
        handle: FileSystemDirectoryHandle,
        collected: Array<{ file: File; name: string }>,
      ): Promise<void> => {
        for await (const [name, entry] of (handle as DirectoryHandleWithEntries).entries()) {
          if (collected.length >= 8) return;
          if (entry.kind === "file" && isAudioFile(name)) {
            const file = await (entry as FileSystemFileHandle).getFile();
            collected.push({ file, name });
          } else if (entry.kind === "directory") {
            await collectAudioFiles(entry as FileSystemDirectoryHandle, collected);
          }
        }
      };

      const item = items[0];
      if (item.kind !== "file") return;
      try {
        const handle = await (item as DataTransferItemWithFileSystemHandle).getAsFileSystemHandle?.();
        if (handle?.kind === "directory") {
          const dirHandle = handle as FileSystemDirectoryHandle;
          const collected: Array<{ file: File; name: string }> = [];
          await collectAudioFiles(dirHandle, collected);
          const samples: Array<{ path: string; name: string; paneType: "source" }> = [];
          for (const { file } of collected) {
            const result = await resolveFileDrop(file, { paneType: "source" });
            if (result.success && result.path && result.name) {
              samples.push({ path: result.path, name: result.name, paneType: "source" });
            }
          }
          if (samples.length > 0) {
            addSamplesToStack(samples, 8);
            openWaveformForActiveSlot();
          }
        } else if (handle?.kind === "file") {
          const file = await (handle as FileSystemFileHandle).getFile();
          if (file && isAudioFile(file.name)) {
            const result = await resolveFileDrop(file, { paneType: "source" });
            if (result.success && result.path && result.name) {
              addToStack({ path: result.path, name: result.name, paneType: "source" });
              openWaveformForActiveSlot();
            } else {
              toast.error(result.error || "Failed to add file");
            }
          }
        }
      } catch {
        const file = await item.getAsFile();
        if (file && isAudioFile(file.name)) {
          const result = await resolveFileDrop(file, { paneType: "source" });
          if (result.success && result.path && result.name) {
            addToStack({ path: result.path, name: result.name, paneType: "source" });
            openWaveformForActiveSlot();
          } else {
            toast.error(result.error || "Failed to add file");
          }
        }
      }
    },
    [addToStack, addSamplesToStack, openWaveformForActiveSlot],
  );

  const filledSlots = slots.flatMap((sample, slotIndex) => (sample ? [{ sample, slotIndex }] : []));
  const lastOccupiedIndex = slots.reduce((last, sample, index) => (sample ? index : last), -1);
  const nextInsertIndex = lastOccupiedIndex + 1;

  return (
    <div className={cn("border-t border-border bg-card p-2", className)}>
      <div className="mb-2">
        {/* Global Transport Block */}
        <div
          className="flex flex-wrap items-center gap-2 border border-border rounded-md bg-muted/30 p-2 w-full max-w-[620px]"
          data-testid="stack-transport"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mr-2">Transport</div>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 p-0"
            onClick={togglePlay}
            disabled={stack.length === 0}
            aria-label={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 p-0"
            onClick={handleStop}
            disabled={stack.length === 0}
            aria-label="Stop"
          >
            <Square className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant={volumeMode ? "default" : "secondary"}
            className="h-8 gap-2"
            onClick={() => setVolumeMode((previous) => !previous)}
            aria-pressed={volumeMode}
            aria-label="Toggle volume mode"
            data-testid="stack-volume-mode-toggle"
          >
            <Volume2 className="w-4 h-4" />
            Volume Mode
            <span className="text-[10px] uppercase tracking-wide opacity-70">Cmd+V</span>
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 min-w-0 w-full max-w-[620px]">
        {filledSlots.map(({ sample, slotIndex }) => (
          <MultiSampleBlock
            key={`${sample.id}-${rootReloadToken}`}
            sample={sample}
            index={slotIndex}
            isActive={activeSlotIndex === slotIndex}
            showVolumeOverlay={volumeMode}
            onRemove={() => {
              if (slotIndex === activeSlotIndex) closeWaveform();
              removeFromStack(slotIndex);
            }}
            onDropSample={(s) => {
              replaceSampleAt(slotIndex, s);
              if (slotIndex === activeSlotIndex) {
                const currentSlots = useProjectStore.getState().getActiveStack()?.slots ?? [];
                const updated = currentSlots[activeSlotIndex];
                if (updated) {
                  setActiveSample(updated.id);
                  useWaveformEditorStore
                    .getState()
                    .openWithFileFromMulti(updated.path, updated.name, updated.paneType, updated.id);
                }
              }
            }}
            onClick={() => setActiveSample(sample.id)}
          />
        ))}

        <EmptyBlock
          key={`empty-slot-${nextInsertIndex}`}
          slotIndex={nextInsertIndex}
          isActive={activeSlotIndex === nextInsertIndex}
          onDrop={(e) => {
            setActiveSlotIndex(nextInsertIndex);
            handleMultiDrop(e);
          }}
          onClick={() => handleEmptySlotClick(nextInsertIndex)}
        />
      </div>
    </div>
  );
};
