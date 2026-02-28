import { useRef, useEffect, useState, useCallback } from "react";
import { Play, Pause, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMultiSampleStore } from "@/stores/multi-sample-store";
import { MultiSampleBlock } from "@/components/MultiSampleBlock";
import { fileSystemService } from "@/lib/fileSystem";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const AUDIO_EXT = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i;
function isAudioFile(name: string): boolean {
  return AUDIO_EXT.test(name);
}

interface EmptyBlockProps {
  onDrop?: (e: React.DragEvent) => void;
}

function EmptyBlock({ onDrop }: EmptyBlockProps) {
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
      className={cn(
        "flex flex-col items-center justify-center border border-dashed rounded-lg min-h-[100px] text-muted-foreground transition-colors",
        isDragOver ? "border-primary bg-primary/5" : "border-border bg-muted/30"
      )}
      aria-hidden
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
      >
        {Array.from({ length: 20 }).map((_, i) => {
          const h = 4 + ((i * 7) % 9);
          const y = (20 - h) / 2;
          return (
            <rect
              key={i}
              x={i * 5}
              y={y}
              width="3"
              height={h}
              className="fill-current"
            />
          );
        })}
      </svg>
    </div>
  );
}

interface MultiSampleStackProps {
  className?: string;
}

export const MultiSampleStack = ({ className }: MultiSampleStackProps) => {
  const stack = useMultiSampleStore((s) => s.stack);
  const globalTempoBpm = useMultiSampleStore((s) => s.globalTempoBpm);
  const removeFromStack = useMultiSampleStore((s) => s.removeFromStack);
  const addToStack = useMultiSampleStore((s) => s.addToStack);
  const addSamplesToStack = useMultiSampleStore((s) => s.addSamplesToStack);
  const replaceSampleAt = useMultiSampleStore((s) => s.replaceSampleAt);

  const [isPlaying, setIsPlaying] = useState(false);
  const playFnsRef = useRef<Map<string, () => void>>(new Map());
  const stopFnsRef = useRef<Map<string, () => void>>(new Map());
  const startTimeRef = useRef<number>(0);
  const nextTriggerBarRef = useRef<Map<string, number>>(new Map());
  const rafIdRef = useRef<number>(0);

  const registerPlay = useCallback((sampleId: string, play: () => void) => {
    playFnsRef.current.set(sampleId, play);
  }, []);

  const registerStop = useCallback((sampleId: string, stop: () => void) => {
    stopFnsRef.current.set(sampleId, stop);
  }, []);

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    nextTriggerBarRef.current.clear();
    stack.forEach((s) => {
      const stop = stopFnsRef.current.get(s.id);
      stop?.();
    });
  }, [stack]);

  const togglePlay = useCallback(() => {
    if (stack.length === 0) return;
    const hasValidBars = stack.some((s) => s.bars != null && s.bars > 0);
    if (!hasValidBars) return;

    if (isPlaying) {
      handleStop();
      return;
    }

    startTimeRef.current = performance.now();
    nextTriggerBarRef.current.clear();
    stack.forEach((s) => nextTriggerBarRef.current.set(s.id, 0));
    setIsPlaying(true);
  }, [isPlaying, stack, handleStop]);

  useEffect(() => {
    if (!isPlaying || stack.length === 0) return;

    const secondsPerBar = (60 / globalTempoBpm) * 4;

    const tick = () => {
      const elapsed = (performance.now() - startTimeRef.current) / 1000;
      const currentBar = elapsed / secondsPerBar;

      stack.forEach((sample) => {
        const bars = sample.bars ?? 0;
        if (bars <= 0) return;

        const nextBar = nextTriggerBarRef.current.get(sample.id) ?? 0;
        if (currentBar >= nextBar) {
          const play = playFnsRef.current.get(sample.id);
          play?.();
          nextTriggerBarRef.current.set(sample.id, nextBar + bars);
        }
      });

      rafIdRef.current = requestAnimationFrame(tick);
    };

    rafIdRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    };
  }, [isPlaying, stack, globalTempoBpm]);

  const totalSlots = 5;
  const filledCount = 1 + stack.length;
  const emptyCount = Math.max(0, totalSlots - filledCount);

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
          }
        } else if (sourceType === "file" && isAudioFile(sourcePath.split("/").pop() || "")) {
          const name = sourcePath.split("/").filter(Boolean).pop() || sourcePath;
          addToStack({ path: sourcePath, name, paneType: sourcePane as "source" | "dest" });
        }
        return;
      }

      const items = e.dataTransfer.items;
      if (!items?.length || !fileSystemService.hasRootForPane("source")) return;

      const collectAudioFiles = async (
        handle: FileSystemDirectoryHandle,
        collected: Array<{ file: File; name: string }>
      ): Promise<void> => {
        for await (const [name, entry] of (handle as any).entries()) {
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
        const handle = await (item as any).getAsFileSystemHandle?.();
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
          if (samples.length > 0) addSamplesToStack(samples, 8);
        } else if (handle?.kind === "file") {
          const file = await (handle as FileSystemFileHandle).getFile();
          if (file && isAudioFile(file.name)) {
            const result = await fileSystemService.addFileFromDrop(file, "/", "source");
            if (result.success && result.data) {
              const path = result.data;
              const name = path.split("/").filter(Boolean).pop() || file.name;
              addToStack({ path, name, paneType: "source" });
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
          } else {
            toast.error("Select a source folder first to add files from your computer");
          }
        }
      }
    },
    [addToStack, addSamplesToStack]
  );

  return (
    <div
      className={cn(
        "border-t border-border bg-card p-3",
        className
      )}
    >
      <div className="grid grid-cols-[minmax(180px,1fr)_minmax(200px,1fr)_minmax(200px,1fr)_minmax(200px,1fr)_minmax(200px,1fr)] gap-3 max-w-full">
        {/* Global Transport Block */}
        <div className="flex flex-col gap-2 border border-border rounded-lg bg-muted/30 p-3 shrink-0">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Transport
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 w-8 p-0"
              onClick={togglePlay}
              disabled={stack.length === 0}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
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

        {/* Sample blocks */}
        {stack.map((sample, index) => (
          <MultiSampleBlock
            key={sample.id}
            sample={sample}
            index={index}
            onRemove={() => removeFromStack(index)}
            onDropSample={(s) => replaceSampleAt(index, s)}
            onRegisterPlay={registerPlay}
            onRegisterStop={registerStop}
          />
        ))}

        {/* Empty placeholders */}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <EmptyBlock key={`empty-${i}`} onDrop={handleMultiDrop} />
        ))}
      </div>
    </div>
  );
};
