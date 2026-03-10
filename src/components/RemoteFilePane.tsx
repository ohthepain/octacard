import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileAudio, Folder, FolderOpen, Loader2, Search, ShoppingCart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { toast } from "sonner";
import {
  addSampleToCollection,
  getPack,
  getPackContents,
  searchRemoteLibrary,
  type RemotePackSummary,
  type RemoteSampleSummary,
  type RemoteScope,
  type RemoteSearchType,
} from "@/lib/remote-library";
import { PackView } from "@/components/PackView";

type RemoteDragItem = { kind: "pack"; id: string; name: string } | { kind: "sample"; id: string; name: string };

interface RemoteFilePaneProps {
  title?: string;
  scope: RemoteScope;
  onSelectionChange?: (selection: { path: string; type: "file" | "folder"; name: string } | null) => void;
}

function formatCredits(credits: number): string {
  return credits <= 0 ? "Free" : `${credits} cr`;
}

function PackRow({
  onOpenPack,
  onSelect,
  onDragStart,
  children,
}: {
  onOpenPack: () => void;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div
          draggable
          onDragStart={onDragStart}
          onClick={onSelect}
          className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-accent cursor-grab active:cursor-grabbing"
        >
          {children}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onSelect={onOpenPack}>
          <FolderOpen className="w-4 h-4 mr-2" />
          Open pack
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function RemoteFilePane({ title = "Global", scope, onSelectionChange }: RemoteFilePaneProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<RemoteSearchType>("both");
  const [loading, setLoading] = useState(false);
  const [packs, setPacks] = useState<RemotePackSummary[]>([]);
  const [samples, setSamples] = useState<RemoteSampleSummary[]>([]);

  const [currentPackId, setCurrentPackId] = useState<string | null>(null);
  const [packDetails, setPackDetails] = useState<{ name: string; coverImageUrl: string | null } | null>(null);
  const [packContents, setPackContents] = useState<{
    packs: RemotePackSummary[];
    samples: RemoteSampleSummary[];
  } | null>(null);
  const [packLoading, setPackLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      try {
        const result = await searchRemoteLibrary({
          q: query,
          scope,
          types: mode,
          limit: 100,
        });
        if (cancelled) return;
        setPacks(result.packs);
        setSamples(result.samples);
      } catch (error) {
        if (!cancelled) {
          toast.error("Remote query failed", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [query, scope, mode]);

  useEffect(() => {
    if (!currentPackId) {
      setPackDetails(null);
      setPackContents(null);
      return;
    }
    let cancelled = false;
    setPackLoading(true);
    Promise.all([getPack(currentPackId), getPackContents(currentPackId)])
      .then(([details, contents]) => {
        if (cancelled) return;
        setPackDetails({
          name: details.name,
          coverImageUrl: details.coverImageUrl,
        });
        setPackContents({
          packs: contents.packs,
          samples: contents.samples,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error("Failed to load pack", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
          setCurrentPackId(null);
        }
      })
      .finally(() => {
        if (!cancelled) setPackLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPackId]);

  const entries = useMemo(() => {
    const list: Array<{
      key: string;
      type: "pack" | "sample";
      pack?: RemotePackSummary;
      sample?: RemoteSampleSummary;
      updatedAt: string;
    }> = [];

    for (const pack of packs) {
      list.push({
        key: `pack:${pack.id}`,
        type: "pack",
        pack,
        updatedAt: pack.updatedAt,
      });
    }

    for (const sample of samples) {
      list.push({
        key: `sample:${sample.id}`,
        type: "sample",
        sample,
        updatedAt: sample.updatedAt,
      });
    }

    return list.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  }, [packs, samples]);

  const packViewEntries = useMemo(() => {
    if (!packContents) return [];
    const list: Array<{
      key: string;
      type: "pack" | "sample";
      pack?: RemotePackSummary;
      sample?: RemoteSampleSummary;
    }> = [];
    for (const pack of packContents.packs) {
      list.push({ key: `pack:${pack.id}`, type: "pack", pack });
    }
    for (const sample of packContents.samples) {
      list.push({ key: `sample:${sample.id}`, type: "sample", sample });
    }
    return list;
  }, [packContents]);

  const startDrag = (event: React.DragEvent, item: RemoteDragItem) => {
    event.dataTransfer.setData("octacardRemoteItems", JSON.stringify([item]));
    event.dataTransfer.setData("sourcePane", "remote");
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleClosePack = () => {
    setCurrentPackId(null);
  };

  const isPackView = currentPackId !== null;

  return (
    <div className="flex flex-col h-full bg-background border border-border rounded-lg overflow-hidden">
      {isPackView ? (
        packDetails ? (
          <PackView
            name={packDetails.name}
            coverImageUrl={packDetails.coverImageUrl}
            onClose={handleClosePack}
          />
        ) : (
          <div className="flex items-center gap-2 p-3 border-b border-border bg-card/50 shrink-0">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 shrink-0"
              onClick={handleClosePack}
              aria-label="Close pack"
            >
              <ArrowLeft className="w-4 h-4" />
            </Button>
            {packLoading && (
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            )}
          </div>
        )
      ) : (
        <div className="border-b border-border p-4 pb-2">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium">{title}</div>
            <div className="text-xs text-muted-foreground uppercase tracking-wide">{scope}</div>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex items-center rounded-md border border-border overflow-hidden">
              <Button
                size="sm"
                variant={mode === "samples" ? "secondary" : "ghost"}
                className="rounded-none"
                onClick={() => setMode("samples")}
              >
                Samples
              </Button>
              <Button
                size="sm"
                variant={mode === "packs" ? "secondary" : "ghost"}
                className="rounded-none"
                onClick={() => setMode("packs")}
              >
                Packs
              </Button>
              <Button
                size="sm"
                variant={mode === "both" ? "secondary" : "ghost"}
                className="rounded-none"
                onClick={() => setMode("both")}
              >
                All
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9 w-52"
                placeholder="Search remote..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2">
          {isPackView ? (
            packLoading && !packContents ? (
              <div className="py-8 flex items-center justify-center text-sm text-muted-foreground gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Loading pack...
              </div>
            ) : packViewEntries.length === 0 ? (
              <div className="py-8 text-center space-y-2">
                <div className="text-sm text-muted-foreground">This pack is empty</div>
                <p className="text-xs text-muted-foreground/80">
                  Add samples or sub-packs to this pack.
                </p>
              </div>
            ) : (
              packViewEntries.map((entry) => {
                if (entry.type === "pack" && entry.pack) {
                  const pack = entry.pack;
                  return (
                    <PackRow
                      key={entry.key}
                      onOpenPack={() => setCurrentPackId(pack.id)}
                      onSelect={() =>
                        onSelectionChange?.({
                          path: `remote://pack/${pack.id}`,
                          type: "folder",
                          name: pack.name,
                        })
                      }
                      onDragStart={(e) =>
                        startDrag(e, { kind: "pack", id: pack.id, name: pack.name })
                      }
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <Folder className="w-4 h-4 text-amber-600 shrink-0" />
                        <div className="truncate">
                          <div className="text-sm truncate">{pack.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {pack.sampleCount} samples, {pack.childPackCount} subfolders
                          </div>
                        </div>
                      </div>
                      {pack.isOwner && (
                        <div className="text-[10px] uppercase text-primary">Mine</div>
                      )}
                    </PackRow>
                  );
                }

                if (entry.type === "sample" && entry.sample) {
                  const sample = entry.sample;
                  return (
                    <div
                      key={entry.key}
                      draggable={sample.canDownload}
                      onDragStart={(e) =>
                        sample.canDownload &&
                        startDrag(e, {
                          kind: "sample",
                          id: sample.id,
                          name: sample.name,
                        })
                      }
                      onClick={() =>
                        onSelectionChange?.({
                          path: `remote://sample/${sample.id}`,
                          type: "file",
                          name: sample.name,
                        })
                      }
                      className={`flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-accent ${sample.canDownload ? "cursor-grab active:cursor-grabbing" : "opacity-70"}`}
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <FileAudio className="w-4 h-4 text-sky-600 shrink-0" />
                        <div className="truncate">
                          <div className="text-sm truncate">{sample.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {formatCredits(sample.credits)}
                            {!sample.canDownload ? " • locked" : ""}
                          </div>
                        </div>
                      </div>
                      {!sample.canDownload && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await addSampleToCollection(sample.id);
                              toast.success("Added to collection");
                              if (currentPackId) {
                                const contents = await getPackContents(currentPackId);
                                setPackContents({
                                  packs: contents.packs,
                                  samples: contents.samples,
                                });
                              }
                            } catch (error) {
                              toast.error("Failed to add to collection", {
                                description: error instanceof Error ? error.message : "Unknown error",
                              });
                            }
                          }}
                        >
                          <ShoppingCart className="w-3 h-3" />
                          Add
                        </Button>
                      )}
                    </div>
                  );
                }

                return null;
              })
            )
          ) : loading ? (
            <div className="py-8 flex items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading...
            </div>
          ) : entries.length === 0 ? (
            <div className="py-8 text-center space-y-2">
              <div className="text-sm text-muted-foreground">No remote results</div>
              <p className="text-xs text-muted-foreground/80">
                Octacard manages and converts sample files for your hardware.
              </p>
            </div>
          ) : (
            entries.map((entry) => {
              if (entry.type === "pack" && entry.pack) {
                const pack = entry.pack;
                return (
                  <PackRow
                    key={entry.key}
                    onOpenPack={() => setCurrentPackId(pack.id)}
                    onSelect={() =>
                      onSelectionChange?.({
                        path: `remote://pack/${pack.id}`,
                        type: "folder",
                        name: pack.name,
                      })
                    }
                    onDragStart={(e) =>
                      startDrag(e, {
                        kind: "pack",
                        id: pack.id,
                        name: pack.name,
                      })
                    }
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <Folder className="w-4 h-4 text-amber-600 shrink-0" />
                      <div className="truncate">
                        <div className="text-sm truncate">{pack.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {pack.sampleCount} samples, {pack.childPackCount} subfolders
                        </div>
                      </div>
                    </div>
                    {pack.isOwner && (
                      <div className="text-[10px] uppercase text-primary">Mine</div>
                    )}
                  </PackRow>
                );
              }

              if (entry.type === "sample" && entry.sample) {
                const sample = entry.sample;
                return (
                  <div
                    key={entry.key}
                    draggable={sample.canDownload}
                    onDragStart={(e) =>
                      sample.canDownload &&
                      startDrag(e, {
                        kind: "sample",
                        id: sample.id,
                        name: sample.name,
                      })
                    }
                    onClick={() =>
                      onSelectionChange?.({
                        path: `remote://sample/${sample.id}`,
                        type: "file",
                        name: sample.name,
                      })
                    }
                    className={`flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-accent ${sample.canDownload ? "cursor-grab active:cursor-grabbing" : "opacity-70"}`}
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <FileAudio className="w-4 h-4 text-sky-600 shrink-0" />
                      <div className="truncate">
                        <div className="text-sm truncate">{sample.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {sample.packName} • {formatCredits(sample.credits)}
                          {!sample.canDownload ? " • locked" : ""}
                        </div>
                      </div>
                    </div>
                    {!sample.canDownload && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 gap-1"
                        onClick={async (e) => {
                          e.stopPropagation();
                          try {
                            await addSampleToCollection(sample.id);
                            toast.success("Added to collection");
                            const updated = await searchRemoteLibrary({
                              q: query,
                              scope,
                              types: mode,
                              limit: 100,
                            });
                            setPacks(updated.packs);
                            setSamples(updated.samples);
                          } catch (error) {
                            toast.error("Failed to add to collection", {
                              description: error instanceof Error ? error.message : "Unknown error",
                            });
                          }
                        }}
                      >
                        <ShoppingCart className="w-3 h-3" />
                        Add
                      </Button>
                    )}
                  </div>
                );
              }

              return null;
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
