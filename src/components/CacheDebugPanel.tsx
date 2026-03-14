import { useEffect, useState, useRef, useCallback } from "react";
import { Play, Square, Trash2, Database } from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useCacheDebugStore } from "@/stores/cache-debug-store";
import {
  listCacheEntries,
  evictAll,
  evictSample,
  getOrFetchRemoteSample,
  type CacheEntryInfo,
} from "@/lib/audition-cache";
import { ensureAudioDecodable } from "@/lib/audioConverter";
import { getSample } from "@/lib/remote-library";
import { usePlayerStore } from "@/stores/player-store";
import { SampleSourceBadge } from "@/components/SampleSourceBadge";

const REMOTE_PREFIX = "remote://sample/";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function extensionFromContentType(ct: string): string {
  if (ct.includes("wav")) return "wav";
  if (ct.includes("mp3") || ct.includes("mpeg")) return "mp3";
  if (ct.includes("flac")) return "flac";
  if (ct.includes("ogg")) return "ogg";
  if (ct.includes("aiff") || ct.includes("aif")) return "aiff";
  if (ct.includes("m4a") || ct.includes("mp4")) return "m4a";
  return "wav";
}

interface CacheCardProps {
  entry: CacheEntryInfo;
  onRefresh: () => void;
}

function fallbackName(entry: CacheEntryInfo): string {
  const ext = extensionFromContentType(entry.contentType);
  return `${entry.sampleId.slice(0, 12)}.${ext}`;
}

function CacheCard({ entry, onRefresh }: CacheCardProps) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sampleName, setSampleName] = useState<string | null>(null);
  const playSingle = usePlayerStore((s) => s.playSingle);
  const stop = usePlayerStore((s) => s.stop);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const singleFile = usePlayerStore((s) => s.singleFile);
  const path = `${REMOTE_PREFIX}${entry.sampleId}`;
  const isThisPlaying = isPlaying && singleFile?.path === path;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { objectUrl } = await getOrFetchRemoteSample(entry.sampleId, "sample");
        if (cancelled) return;

        const decodableUrl = await ensureAudioDecodable(objectUrl, path);
        if (cancelled || !waveformRef.current) return;

        const ws = WaveSurfer.create({
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

        wavesurferRef.current = ws;

        ws.on("ready", () => {
          if (cancelled) return;
          const width = waveformRef.current?.clientWidth ?? 400;
          ws.zoom(Math.max(1, width / ws.getDuration()));
          setIsLoading(false);
        });

        ws.on("error", (err) => {
          if (cancelled) return;
          setError(err.message || "Failed to load");
          setIsLoading(false);
        });

        await ws.load(decodableUrl);
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (wavesurferRef.current) {
        try {
          wavesurferRef.current.destroy();
        } catch {
          /* ignore */
        }
        wavesurferRef.current = null;
      }
    };
  }, [entry.sampleId, path]);

  useEffect(() => {
    let cancelled = false;
    getSample(entry.sampleId)
      .then((s) => {
        if (!cancelled) setSampleName(s.name);
      })
      .catch(() => {
        if (!cancelled) setSampleName(fallbackName(entry));
      });
    return () => {
      cancelled = true;
    };
  }, [entry.sampleId, entry.contentType]);

  const playerCurrentTime = usePlayerStore((s) => s.currentTime);
  const currentTime = isPlaying && singleFile?.path === path ? playerCurrentTime : null;

  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || currentTime == null) return;
    const dur = ws.getDuration();
    if (dur > 0) {
      const safeTime = Math.min(currentTime, dur * 0.9999);
      ws.seekTo(safeTime / dur);
    }
  }, [currentTime]);

  const handlePlay = useCallback(() => {
    if (isThisPlaying) {
      stop();
    } else {
      playSingle(path, "source");
    }
  }, [isThisPlaying, stop, playSingle, path]);

  const handleRemove = useCallback(
    async (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      await evictSample(entry.sampleId);
      onRefresh();
    },
    [entry.sampleId, onRefresh],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      const name = sampleName ?? fallbackName(entry);
      e.dataTransfer.setData("octacardRemoteItems", JSON.stringify([{ kind: "sample", id: entry.sampleId, name }]));
      e.dataTransfer.setData("sourcePane", "remote");
      e.dataTransfer.effectAllowed = "copy";
    },
    [entry, sampleName],
  );

  const name = sampleName ?? fallbackName(entry);

  return (
    <div
      className="flex flex-col border border-border rounded-lg bg-card overflow-hidden transition-colors cursor-pointer"
      draggable
      onDragStart={handleDragStart}
    >
      <div className="flex items-center justify-between px-2 py-1 border-b border-border shrink-0 gap-2">
        <SampleSourceBadge
          source={{ type: "remote", sampleId: entry.sampleId }}
          filename={name}
          size="md"
          showFilename={true}
          className="flex-1 min-w-0"
        />
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-5 w-5 p-0 shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleRemove}
          aria-label="Remove from cache"
        >
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      <div className="flex items-center gap-1 px-2 py-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="shrink-0 h-6 w-6 text-primary hover:bg-primary/10"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            handlePlay();
          }}
          aria-label={isThisPlaying ? "Stop" : "Play"}
        >
          {isThisPlaying ? (
            <Square className="h-3 w-3 fill-current" />
          ) : (
            <Play className="h-3 w-3" />
          )}
        </Button>
        <div className="flex-1 min-h-[60px] relative">
          {error ? (
            <div className="p-2 text-xs text-destructive">{error}</div>
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
    </div>
  );
}

export function CacheDebugPanel() {
  const { isOpen, close } = useCacheDebugStore();
  const [entries, setEntries] = useState<CacheEntryInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false);
  const totalBytes = entries.reduce((s, e) => s + e.sizeBytes, 0);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const list = await listCacheEntries();
      setEntries(list);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void refresh();
    }
  }, [isOpen, refresh]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        close();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, close]);

  const handleClear = useCallback(async () => {
    await evictAll();
    setClearConfirm(false);
    setEntries([]);
  }, []);

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && close()}>
      <SheetContent
        side="right"
        className="w-[90vw]! max-w-4xl! h-[80vh]! flex flex-col gap-0 p-0 border-l-2 border-violet-500/30 bg-background"
      >
        <SheetHeader className="shrink-0 px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between w-full gap-4">
            <div className="flex items-center gap-2 min-w-0">
              <SheetTitle className="flex items-center gap-2 text-violet-600 shrink-0">
                <Database className="h-5 w-5" />
                Cache Debug Panel
              </SheetTitle>
              <span className="text-xs text-muted-foreground shrink-0">Esc to close</span>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground shrink-0">
              <span>
                {entries.length} item{entries.length !== 1 ? "s" : ""}
              </span>
              <span>{formatBytes(totalBytes)} total</span>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          {isLoading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : entries.length === 0 ? (
            <div className="text-muted-foreground text-sm py-8">
              No cached items. Audition samples from the global library to populate the cache.
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {entries.map((entry) => (
                <CacheCard key={entry.sampleId} entry={entry} onRefresh={refresh} />
              ))}
            </div>
          )}
        </ScrollArea>

        <SheetFooter className="shrink-0 px-6 py-4 border-t border-border flex-row justify-end">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => setClearConfirm(true)}
            disabled={entries.length === 0}
          >
            Clear Cache
          </Button>
        </SheetFooter>
      </SheetContent>

      <AlertDialog open={clearConfirm} onOpenChange={setClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear entire cache?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove all cached samples from IndexedDB. Samples will be re-downloaded when auditioned again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClear}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Clear Cache
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
