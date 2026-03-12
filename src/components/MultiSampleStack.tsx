import { useState, useCallback } from "react";
import { Play, Pause, Square, Plus, Minus, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMultiSampleStore } from "@/stores/multi-sample-store";
import { useWaveformEditorStore } from "@/stores/waveform-editor-store";
import { usePlayerStore } from "@/stores/player-store";
import { MultiSampleBlock } from "@/components/MultiSampleBlock";
import { fileSystemService } from "@/lib/fileSystem";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { SLOT_ROW_SIZE } from "@/stores/multi-sample-store";

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
        "flex flex-col items-center justify-center border border-dashed rounded-lg min-h-[100px] text-muted-foreground transition-colors cursor-pointer",
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
  const slots = useMultiSampleStore((s) => s.slots);
  const activeSlotIndex = useMultiSampleStore((s) => s.activeSlotIndex);
  const stack = useMultiSampleStore((s) => s.stack);
  const setActiveSlotIndex = useMultiSampleStore((s) => s.setActiveSlotIndex);
  const removeFromStack = useMultiSampleStore((s) => s.removeFromStack);
  const addToStack = useMultiSampleStore((s) => s.addToStack);
  const addSamplesToStack = useMultiSampleStore((s) => s.addSamplesToStack);
  const addSlotRowAt = useMultiSampleStore((s) => s.addSlotRowAt);
  const removeSlotRow = useMultiSampleStore((s) => s.removeSlotRow);
  const moveSlotRow = useMultiSampleStore((s) => s.moveSlotRow);
  const replaceSampleAt = useMultiSampleStore((s) => s.replaceSampleAt);
  const closeWaveform = useWaveformEditorStore((s) => s.close);
  const [draggingRowIndex, setDraggingRowIndex] = useState<number | null>(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null);

  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playMulti = usePlayerStore((s) => s.playMulti);
  const stop = usePlayerStore((s) => s.stop);
  const setActiveSample = usePlayerStore((s) => s.setActiveSample);

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

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
    const { slots, activeSlotIndex } = useMultiSampleStore.getState();
    const sample = slots[activeSlotIndex];
    if (sample) {
      setActiveSample(sample.id);
      useWaveformEditorStore.getState().openWithFileFromMulti(sample.path, sample.name, sample.paneType, sample.id);
    }
  }, [setActiveSample]);

  const handleMultiDrop = useCallback(
    async (e: React.DragEvent) => {
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
      if (!items?.length || !fileSystemService.hasRootForPane("source")) return;

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
          for (const { file, name } of collected) {
            const result = await fileSystemService.addFileFromDrop(file, "/", "source");
            if (result.success && result.data) {
              samples.push({ path: result.data, name, paneType: "source" });
            }
          }
          if (samples.length > 0) {
            addSamplesToStack(samples, 8);
            openWaveformForActiveSlot();
          }
        } else if (handle?.kind === "file") {
          const file = await (handle as FileSystemFileHandle).getFile();
          if (file && isAudioFile(file.name)) {
            const result = await fileSystemService.addFileFromDrop(file, "/", "source");
            if (result.success && result.data) {
              const path = result.data;
              const name = path.split("/").filter(Boolean).pop() || file.name;
              addToStack({ path, name, paneType: "source" });
              openWaveformForActiveSlot();
            }
          }
        }
      } catch {
        const file = await item.getAsFile();
        if (file && isAudioFile(file.name)) {
          const result = await fileSystemService.addFileFromDrop(file, "/", "source");
          if (result.success && result.data) {
            const path = result.data;
            const name = path.split("/").filter(Boolean).pop() || file.name;
            addToStack({ path, name, paneType: "source" });
            openWaveformForActiveSlot();
          } else {
            toast.error("Select a source folder first to add files from your computer");
          }
        }
      }
    },
    [addToStack, addSamplesToStack, openWaveformForActiveSlot],
  );

  const rowCount = Math.max(1, Math.ceil(slots.length / SLOT_ROW_SIZE));
  const rows = Array.from({ length: rowCount }, (_, rowIndex) =>
    slots.slice(rowIndex * SLOT_ROW_SIZE, (rowIndex + 1) * SLOT_ROW_SIZE),
  );

  return (
    <div className={cn("border-t border-border bg-card p-3", className)}>
      <div className="mb-3">
        {/* Global Transport Block */}
        <div
          className="flex flex-col gap-2 border border-border rounded-lg bg-muted/30 p-3 w-full max-w-[240px]"
          data-testid="stack-transport"
          aria-label="Transport controls"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Transport</div>
          <div className="flex items-center gap-2">
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
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 min-w-0">
        {rows.map((rowSlots, rowIndex) => (
          <div
            //biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
            key={rowSlots[rowIndex]?.id ?? `stack-row-${rowIndex}`}
            className={cn(
              "grid grid-cols-[44px_repeat(4,minmax(0,1fr))] gap-3 min-w-0",
              dragOverRowIndex === rowIndex && "outline-1 outline-primary/60 rounded-md p-1",
            )}
            onDragOver={(e) => {
              e.preventDefault();
              if (draggingRowIndex != null) {
                setDragOverRowIndex(rowIndex);
              }
            }}
            onDragLeave={() => {
              if (dragOverRowIndex === rowIndex) {
                setDragOverRowIndex(null);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (draggingRowIndex != null && draggingRowIndex !== rowIndex) {
                moveSlotRow(draggingRowIndex, rowIndex);
              }
              setDraggingRowIndex(null);
              setDragOverRowIndex(null);
            }}
          >
            <div
              className="flex flex-col items-center justify-start gap-1 border border-border rounded-lg bg-muted/30 p-1"
              data-testid={`stack-row-controls-${rowIndex}`}
            >
              <Button
                size="sm"
                variant="secondary"
                className="h-7 w-7 p-0"
                onClick={() => addSlotRowAt(rowIndex)}
                aria-label="Add row above"
                data-testid={rowIndex === 0 ? "stack-add-row-button" : `stack-row-add-${rowIndex}`}
              >
                <Plus className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="h-7 w-7 p-0"
                onClick={() => removeSlotRow(rowIndex)}
                aria-label="Delete row"
                disabled={rowCount <= 1}
                data-testid={`stack-row-delete-${rowIndex}`}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <button
                type="button"
                className="h-7 w-7 rounded-md border border-border bg-background flex items-center justify-center text-muted-foreground cursor-grab active:cursor-grabbing"
                aria-label="Drag row to reorder"
                data-testid={`stack-row-drag-${rowIndex}`}
                draggable
                onDragStart={() => {
                  setDraggingRowIndex(rowIndex);
                  setDragOverRowIndex(rowIndex);
                }}
                onDragEnd={() => {
                  setDraggingRowIndex(null);
                  setDragOverRowIndex(null);
                }}
              >
                <GripVertical className="w-3.5 h-3.5" />
              </button>
            </div>

            {rowSlots.map((sample, colIndex) => {
              const slotIndex = rowIndex * SLOT_ROW_SIZE + colIndex;
              return sample ? (
                <MultiSampleBlock
                  key={`${sample.id}-${rootReloadToken}`}
                  sample={sample}
                  index={slotIndex}
                  isActive={activeSlotIndex === slotIndex}
                  onRemove={() => {
                    if (slotIndex === activeSlotIndex) closeWaveform();
                    removeFromStack(slotIndex);
                  }}
                  onDropSample={(s) => {
                    replaceSampleAt(slotIndex, s);
                    if (slotIndex === activeSlotIndex) {
                      const { slots } = useMultiSampleStore.getState();
                      const updated = slots[activeSlotIndex];
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
              ) : (
                <EmptyBlock
                  key={`empty-slot-${slotIndex}`}
                  slotIndex={slotIndex}
                  isActive={activeSlotIndex === slotIndex}
                  onDrop={(e) => {
                    setActiveSlotIndex(slotIndex);
                    handleMultiDrop(e);
                  }}
                  onClick={() => handleEmptySlotClick(slotIndex)}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};
