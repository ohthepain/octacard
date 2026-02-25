import { useRef, useEffect, useState, useCallback } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMultiSampleStore } from "@/stores/multi-sample-store";
import { MultiSampleBlock } from "@/components/MultiSampleBlock";
import { cn } from "@/lib/utils";

function EmptyBlock() {
  return (
    <div
      className="flex flex-col items-center justify-center border border-dashed border-border rounded-lg bg-muted/30 min-h-[100px] text-muted-foreground"
      aria-hidden
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
  const setGlobalTempoBpm = useMultiSampleStore((s) => s.setGlobalTempoBpm);
  const removeFromStack = useMultiSampleStore((s) => s.removeFromStack);

  const [isPlaying, setIsPlaying] = useState(false);
  const playFnsRef = useRef<Map<string, () => void>>(new Map());
  const startTimeRef = useRef<number>(0);
  const nextTriggerBarRef = useRef<Map<string, number>>(new Map());
  const rafIdRef = useRef<number>(0);

  const registerPlay = useCallback((sampleId: string, play: () => void) => {
    playFnsRef.current.set(sampleId, play);
  }, []);

  const togglePlay = useCallback(() => {
    if (stack.length === 0) return;
    const hasValidBars = stack.some((s) => s.bars != null && s.bars > 0);
    if (!hasValidBars) return;

    if (isPlaying) {
      setIsPlaying(false);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      return;
    }

    startTimeRef.current = performance.now();
    nextTriggerBarRef.current.clear();
    stack.forEach((s) => nextTriggerBarRef.current.set(s.id, 0));
    setIsPlaying(true);
  }, [isPlaying, stack]);

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
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Label htmlFor="global-tempo" className="text-xs shrink-0">
                BPM
              </Label>
              <Input
                id="global-tempo"
                type="number"
                min={50}
                max={240}
                value={globalTempoBpm}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (!Number.isNaN(v) && v >= 50 && v <= 240) {
                    setGlobalTempoBpm(v);
                  }
                }}
                className="h-7 w-16 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Sample blocks */}
        {stack.map((sample, index) => (
          <MultiSampleBlock
            key={sample.id}
            sample={sample}
            index={index}
            onRemove={() => removeFromStack(index)}
            onRegisterPlay={registerPlay}
          />
        ))}

        {/* Empty placeholders */}
        {Array.from({ length: emptyCount }).map((_, i) => (
          <EmptyBlock key={`empty-${i}`} />
        ))}
      </div>
    </div>
  );
};
