import { useState, useCallback, useEffect, useMemo } from "react";
import { Play, Pause, Square, Volume2, CopyPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useProjectStore } from "@/stores/project-store";
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
  testId: string;
  isActive: boolean;
  onDrop?: (e: React.DragEvent) => void;
  onClick?: () => void;
}

function EmptyBlock({ testId, isActive, onDrop, onClick }: EmptyBlockProps) {
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
      data-testid={testId}
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
      <span className="text-xs font-medium">Drop sample</span>
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

export const MultiSampleStack = ({ rootReloadToken = "0:0" }: MultiSampleStackProps) => {
  const stacks = useProjectStore(useShallow((s) => s.stacks));
  const activeStackId = useProjectStore((s) => s.activeStackId);
  const setActiveStackId = useProjectStore((s) => s.setActiveStackId);
  const duplicateActiveStack = useProjectStore((s) => s.duplicateActiveStack);
  const clearStackById = useProjectStore((s) => s.clearStackById);
  const setActiveSlotIndex = useProjectStore((s) => s.setActiveSlotIndex);
  const removeFromStack = useProjectStore((s) => s.removeFromStack);
  const addToStack = useProjectStore((s) => s.addToStack);
  const addSamplesToStack = useProjectStore((s) => s.addSamplesToStack);
  const replaceSampleAt = useProjectStore((s) => s.replaceSampleAt);
  const closeWaveform = useWaveformEditorStore((s) => s.close);
  const selectedWaveformSampleId = useWaveformEditorStore((s) => s.multiSampleId);
  const [volumeMode, setVolumeMode] = useState(false);

  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const playerMode = usePlayerStore((s) => s.mode);
  const playingSamples = usePlayerStore((s) => s.stack);
  const activeSampleId = usePlayerStore((s) => s.activeSampleId);
  const playMulti = usePlayerStore((s) => s.playMulti);
  const stop = usePlayerStore((s) => s.stop);
  const setActiveSample = usePlayerStore((s) => s.setActiveSample);

  const selectedSampleId = selectedWaveformSampleId ?? activeSampleId;

  const currentStackId = useMemo(() => {
    if (selectedSampleId) {
      const selectedStack = stacks.find((stack) => stack.slots.some((slot) => slot?.id === selectedSampleId));
      if (selectedStack) return selectedStack.id;
    }
    return stacks[stacks.length - 1]?.id ?? null;
  }, [stacks, selectedSampleId]);

  useEffect(() => {
    if (currentStackId && currentStackId !== activeStackId) {
      setActiveStackId(currentStackId);
    }
  }, [currentStackId, activeStackId, setActiveStackId]);

  const playingStackId = useMemo(() => {
    if (!isPlaying || playerMode !== "multi") return null;
    const firstPlayingSampleId = playingSamples[0]?.id;
    if (!firstPlayingSampleId) return null;
    return stacks.find((stack) => stack.slots.some((slot) => slot?.id === firstPlayingSampleId))?.id ?? null;
  }, [isPlaying, playerMode, playingSamples, stacks]);

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

  const openWaveformForActiveSlot = useCallback(
    (stackId: string) => {
      setActiveStackId(stackId);
      const targetStack = useProjectStore.getState().stacks.find((stack) => stack.id === stackId);
      const sample = targetStack?.slots[targetStack.activeSlotIndex];
      if (sample) {
        setActiveSample(sample.id);
        useWaveformEditorStore.getState().openWithFileFromMulti(sample.path, sample.name, sample.paneType, sample.id);
      }
    },
    [setActiveSample, setActiveStackId],
  );

  const togglePlayForStack = useCallback(
    (stackId: string) => {
      const targetStack = useProjectStore.getState().stacks.find((stack) => stack.id === stackId);
      const stackSamples = (targetStack?.slots ?? []).filter((slot): slot is NonNullable<typeof slot> => slot != null);
      if (stackSamples.length === 0) return;
      const hasValidBars = stackSamples.some((sample) => sample.bars != null && sample.bars > 0);
      if (!hasValidBars) return;

      if (isPlaying && playingStackId === stackId) {
        stop();
        return;
      }

      setActiveStackId(stackId);
      playMulti(
        stackSamples.map((sample) => ({
          id: sample.id,
          path: sample.path,
          name: sample.name,
          paneType: sample.paneType,
          bpm: sample.bpm,
          duration: sample.duration,
        })),
      );
    },
    [isPlaying, playingStackId, stop, setActiveStackId, playMulti],
  );

  const handleMultiDrop = useCallback(
    async (e: React.DragEvent, stackId: string) => {
      setActiveStackId(stackId);
      const remoteItemsPayload = e.dataTransfer.getData("octacardRemoteItems");
      if (remoteItemsPayload) {
        try {
          const parsed = JSON.parse(remoteItemsPayload) as Array<{ kind: string; id: string; name: string }>;
          const validItems = Array.isArray(parsed)
            ? parsed.filter(
                (item): item is { kind: "sample" | "pack"; id: string; name: string } =>
                  Boolean(item) &&
                  (item.kind === "sample" || item.kind === "pack") &&
                  typeof item.id === "string" &&
                  typeof item.name === "string",
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
                const packSamples = manifest.samples.slice(0, 8 - samples.length).map((sample) => ({
                  path: `remote://sample/${sample.id}` as const,
                  name: sample.name,
                  paneType: "source" as const,
                }));
                samples.push(...packSamples);
              }
            }
            const toAdd = samples.slice(0, 8);
            if (toAdd.length > 0) {
              addSamplesToStack(toAdd, 8);
              openWaveformForActiveSlot(stackId);
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
            const samples = result.data.slice(0, 8).map((file) => ({
              path: file.path,
              name: file.name,
              paneType: sourcePane as "source" | "dest",
            }));
            addSamplesToStack(samples, 8);
            openWaveformForActiveSlot(stackId);
          }
        } else if (sourceType === "file" && isAudioFile(sourcePath.split("/").pop() || "")) {
          const name = sourcePath.split("/").filter(Boolean).pop() || sourcePath;
          addToStack({ path: sourcePath, name, paneType: sourcePane as "source" | "dest" });
          openWaveformForActiveSlot(stackId);
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
            openWaveformForActiveSlot(stackId);
          }
        } else if (handle?.kind === "file") {
          const file = await (handle as FileSystemFileHandle).getFile();
          if (file && isAudioFile(file.name)) {
            const result = await resolveFileDrop(file, { paneType: "source" });
            if (result.success && result.path && result.name) {
              addToStack({ path: result.path, name: result.name, paneType: "source" });
              openWaveformForActiveSlot(stackId);
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
            openWaveformForActiveSlot(stackId);
          } else {
            toast.error(result.error || "Failed to add file");
          }
        }
      }
    },
    [addToStack, addSamplesToStack, openWaveformForActiveSlot, setActiveStackId],
  );

  return (
    <div className="h-full">
      <div className="mb-2 flex flex-wrap items-center bg-muted/30 p-2" data-testid="stack-transport">
        <Button
          size="sm"
          variant="secondary"
          className="h-8 w-8 p-0"
          onClick={() => currentStackId && togglePlayForStack(currentStackId)}
          disabled={!currentStackId}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          className="h-8 w-8 p-0"
          onClick={stop}
          disabled={!isPlaying}
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
        <Button
          size="sm"
          variant="secondary"
          className="h-8 gap-2"
          onClick={() => {
            if (currentStackId) setActiveStackId(currentStackId);
            duplicateActiveStack();
          }}
          data-testid="stack-add-column"
        >
          <CopyPlus className="w-4 h-4" />
          New Stack
        </Button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1">
        {stacks.map((stack, stackIndex) => {
          const isCurrent = currentStackId === stack.id;
          const isPlayingThis = isPlaying && playingStackId === stack.id;
          const lastOccupiedIndex = stack.slots.reduce((last, slot, index) => (slot ? index : last), -1);
          const nextInsertIndex = lastOccupiedIndex + 1;

          return (
            <div
              key={stack.id}
              className={cn(
                "w-[270px] shrink-0 p-2 min-h-full rounded-none",
                isCurrent ? "bg-muted/50" : "bg-card",
              )}
              data-testid={`stack-column-${stackIndex}`}
            >
              <div className="mb-2 flex items-center justify-between gap-1">
                <div className="min-w-0">
                  <div className="text-xs font-semibold truncate">{stack.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {isPlayingThis ? "Playing" : ""}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 w-7 p-0"
                    onClick={() => togglePlayForStack(stack.id)}
                    aria-label={isPlayingThis ? "Pause stack" : "Play stack"}
                  >
                    {isPlayingThis ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 w-7 p-0"
                    onClick={() => {
                      setActiveStackId(stack.id);
                      clearStackById(stack.id);
                      if (selectedSampleId && stack.slots.some((slot) => slot?.id === selectedSampleId)) {
                        closeWaveform();
                        setActiveSample(null);
                      }
                    }}
                    aria-label="Clear stack"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {stack.slots.map((sample, slotIndex) => {
                  const blockIsActive = isCurrent && stack.activeSlotIndex === slotIndex;
                  if (!sample) {
                    return (
                      <EmptyBlock
                        key={`empty-${stack.id}-${slotIndex}`}
                        testId={`empty-slot-${stackIndex}-${slotIndex}`}
                        isActive={blockIsActive}
                        onDrop={(e) => {
                          setActiveStackId(stack.id);
                          setActiveSlotIndex(nextInsertIndex);
                          handleMultiDrop(e, stack.id);
                        }}
                        onClick={() => {
                          setActiveStackId(stack.id);
                          setActiveSlotIndex(Math.min(slotIndex, stack.slots.length - 1));
                          closeWaveform();
                        }}
                      />
                    );
                  }

                  return (
                    <div key={`${sample.id}-${rootReloadToken}`} onMouseDown={() => setActiveStackId(stack.id)}>
                      <MultiSampleBlock
                        sample={sample}
                        index={slotIndex}
                        isActive={blockIsActive}
                        showVolumeOverlay={volumeMode}
                        onRemove={() => {
                          setActiveStackId(stack.id);
                          removeFromStack(slotIndex);
                          if (selectedSampleId === sample.id) {
                            closeWaveform();
                            setActiveSample(null);
                          }
                        }}
                        onDropSample={(droppedSample) => {
                          setActiveStackId(stack.id);
                          replaceSampleAt(slotIndex, droppedSample);
                          openWaveformForActiveSlot(stack.id);
                        }}
                        onClick={() => {
                          setActiveStackId(stack.id);
                          setActiveSample(sample.id);
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
