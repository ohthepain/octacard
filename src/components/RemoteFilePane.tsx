import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  BarChart3,
  Folder,
  Loader2,
  Search,
  ShoppingCart,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CreatePackDialog } from "@/components/CreatePackDialog";
import {
  formatCredits,
  formatSampleSizeMb,
  joinSampleMetaLine,
  PackSampleListRow,
} from "@/components/PackSampleListRow";
import { PackView } from "@/components/PackView";
import { SampleAnalysisDialog } from "@/components/SampleAnalysisDialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  addSampleToCollection,
  getPack,
  getPackContents,
  getPackFavoriters,
  type PackFavoriter,
  type RemotePackSummary,
  type RemoteSampleSummary,
  type RemoteScope,
  type RemoteSearchType,
  searchRemoteLibrary,
  setPackFavorite,
  setPackHidden,
} from "@/lib/remote-library";

type RemoteDragItem =
  | {
      kind: "pack";
      id: string;
      name: string;
      coverImageProxyUrl?: string | null;
    }
  | { kind: "sample"; id: string; name: string };

interface RemoteFilePaneProps {
  title?: string;
  scope: RemoteScope;
  onSelectionChange?: (
    selection: { path: string; type: "file" | "folder"; name: string } | null,
  ) => void;
  /** When set, open this pack on mount. Cleared via onOpenPackIdConsumed after applying. */
  openPackId?: string | null;
  onOpenPackIdConsumed?: () => void;
  /** When set, filter results to only this creator's public packs and samples. */
  creatorId?: string | null;
  /** Increment to request opening the create-pack dialog from outside this pane. */
  createPackRequestToken?: number;
  /** Called after a pack is created from this pane. */
  onPackCreated?: (pack: {
    id: string;
    name: string;
    coverImageProxyUrl?: string | null;
  }) => void;
}

function PackRow({
  onOpenPack,
  onDragStart,
  children,
}: {
  onOpenPack: () => void;
  onDragStart: (e: React.DragEvent) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpenPack}
      className="flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-accent cursor-pointer"
    >
      {children}
    </div>
  );
}

function toInitials(name: string): string {
  const source = name.trim();
  if (!source) return "?";
  if (source.includes(" ")) {
    return source
      .split(" ")
      .map((part) => part[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  }
  return source[0]?.toUpperCase() ?? "?";
}

function PackReactions({
  favoriteCount,
  hideCount,
  isFavoritedByMe,
  isHiddenByMe,
  canViewHideCount,
  canViewLikers,
  onToggleFavorite,
  onToggleHide,
  onOpenLikers,
}: {
  favoriteCount: number;
  hideCount: number;
  isFavoritedByMe: boolean;
  isHiddenByMe: boolean;
  canViewHideCount: boolean;
  canViewLikers: boolean;
  onToggleFavorite: () => void;
  onToggleHide: () => void;
  onOpenLikers: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 shrink-0"
        aria-label={
          canViewLikers
            ? "View users who liked this pack"
            : isFavoritedByMe
              ? "Remove favorite"
              : "Favorite pack"
        }
        title={
          canViewLikers
            ? "View users who liked this pack"
            : isFavoritedByMe
              ? "Remove favorite"
              : "Favorite pack"
        }
        onClick={(event) => {
          event.stopPropagation();
          if (canViewLikers) {
            onOpenLikers();
          } else {
            onToggleFavorite();
          }
        }}
      >
        <ThumbsUp
          className={`h-4 w-4 ${isFavoritedByMe ? "fill-current" : ""}`}
        />
      </Button>
      {canViewLikers ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-7 min-w-8 px-1.5 text-xs shrink-0"
          aria-label="View users who liked this pack"
          title="View users who liked this pack"
          onClick={(event) => {
            event.stopPropagation();
            onOpenLikers();
          }}
        >
          {favoriteCount}
        </Button>
      ) : (
        <span className="text-xs tabular-nums">{favoriteCount}</span>
      )}
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0 shrink-0"
        aria-label={isHiddenByMe ? "Unhide pack" : "Hide pack"}
        title={isHiddenByMe ? "Unhide pack" : "Hide pack"}
        onClick={(event) => {
          event.stopPropagation();
          onToggleHide();
        }}
      >
        <ThumbsDown
          className={`h-4 w-4 ${isHiddenByMe ? "fill-current" : ""}`}
        />
      </Button>
      {canViewHideCount ? (
        <span className="text-xs text-muted-foreground tabular-nums">
          {hideCount}
        </span>
      ) : null}
    </div>
  );
}

export function RemoteFilePane({
  title = "Global",
  scope,
  onSelectionChange,
  openPackId,
  onOpenPackIdConsumed,
  creatorId,
  createPackRequestToken = 0,
  onPackCreated,
}: RemoteFilePaneProps) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<RemoteSearchType>("packs");
  const [loading, setLoading] = useState(false);
  const [packs, setPacks] = useState<RemotePackSummary[]>([]);
  const [samples, setSamples] = useState<RemoteSampleSummary[]>([]);

  const [currentPackId, setCurrentPackId] = useState<string | null>(null);
  const [packDetails, setPackDetails] = useState<{
    id: string;
    ownerId: string;
    name: string;
    coverImageUrl: string | null;
    creatorName?: string;
    isOwner?: boolean;
    totalSampleCount?: number;
    totalSizeBytes?: number;
    favoriteCount: number;
    hideCount: number;
    isFavoritedByMe: boolean;
    isHiddenByMe: boolean;
    canViewHideCount: boolean;
    canViewLikers: boolean;
  } | null>(null);
  const [editPackId, setEditPackId] = useState<string | null>(null);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [packContents, setPackContents] = useState<{
    pack: {
      id: string;
      name: string;
      ownerId: string;
      isOwner: boolean;
      favoriteCount: number;
      hideCount: number;
      isFavoritedByMe: boolean;
      isHiddenByMe: boolean;
      canViewHideCount: boolean;
      canViewLikers: boolean;
    };
    packs: RemotePackSummary[];
    samples: RemoteSampleSummary[];
  } | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [analysisDialogOpen, setAnalysisDialogOpen] = useState(false);
  const [analysisSampleId, setAnalysisSampleId] = useState<string | null>(null);
  const [analysisSampleName, setAnalysisSampleName] = useState<string>("");
  const [likesDialogOpen, setLikesDialogOpen] = useState(false);
  const [likesLoading, setLikesLoading] = useState(false);
  const [likers, setLikers] = useState<PackFavoriter[]>([]);

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
          ...(creatorId ? { ownerId: creatorId } : {}),
        });
        if (cancelled) return;
        setPacks(result.packs);
        setSamples(result.samples);
      } catch (error) {
        if (!cancelled) {
          toast.error("Remote query failed", {
            description:
              error instanceof Error ? error.message : "Unknown error",
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
  }, [query, scope, mode, creatorId]);

  useEffect(() => {
    if (openPackId) {
      setCurrentPackId(openPackId);
      onOpenPackIdConsumed?.();
    }
  }, [openPackId, onOpenPackIdConsumed]);

  useEffect(() => {
    if (createPackRequestToken <= 0) return;
    setEditPackId(null);
    setEditDialogOpen(true);
  }, [createPackRequestToken]);

  useEffect(() => {
    if (!currentPackId) {
      setPackDetails(null);
      setPackContents(null);
      setLikers([]);
      setLikesDialogOpen(false);
      return;
    }
    let cancelled = false;
    setPackLoading(true);
    Promise.all([getPack(currentPackId), getPackContents(currentPackId)])
      .then(([details, contents]) => {
        if (cancelled) return;
        setPackDetails({
          id: details.id,
          ownerId: details.ownerId,
          name: details.name,
          coverImageUrl: details.coverImageProxyUrl ?? details.coverImageUrl,
          creatorName: details.ownerName,
          isOwner: details.isOwner,
          totalSampleCount: details.totalSampleCount,
          totalSizeBytes: details.totalSizeBytes,
          favoriteCount: details.favoriteCount,
          hideCount: details.hideCount,
          isFavoritedByMe: details.isFavoritedByMe,
          isHiddenByMe: details.isHiddenByMe,
          canViewHideCount: details.canViewHideCount,
          canViewLikers: details.canViewLikers,
        });
        setPackContents({
          pack: contents.pack,
          packs: contents.packs,
          samples: contents.samples,
        });
      })
      .catch((error) => {
        if (!cancelled) {
          toast.error("Failed to load pack", {
            description:
              error instanceof Error ? error.message : "Unknown error",
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

    const seenSampleIds = new Set<string>();
    for (const sample of samples) {
      if (seenSampleIds.has(sample.id)) continue;
      seenSampleIds.add(sample.id);
      list.push({
        key: `sample:${sample.packId}:${sample.id}`,
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
    const seenSampleIds = new Set<string>();
    for (const sample of packContents.samples) {
      if (seenSampleIds.has(sample.id)) continue;
      seenSampleIds.add(sample.id);
      list.push({
        key: `sample:${sample.packId}:${sample.id}`,
        type: "sample",
        sample,
      });
    }
    return list;
  }, [packContents]);

  const applyReactionUpdate = (
    packId: string,
    update: {
      favoriteCount: number;
      hideCount: number;
      isFavoritedByMe: boolean;
      isHiddenByMe: boolean;
      canViewHideCount: boolean;
      canViewLikers: boolean;
    },
  ) => {
    setPacks((current) =>
      current.map((pack) =>
        pack.id === packId
          ? {
              ...pack,
              ...update,
            }
          : pack,
      ),
    );
    setPackContents((current) =>
      current
        ? {
            ...current,
            packs: current.packs.map((pack) =>
              pack.id === packId
                ? {
                    ...pack,
                    ...update,
                  }
                : pack,
            ),
            pack:
              current.pack.id === packId
                ? {
                    ...current.pack,
                    ...update,
                  }
                : current.pack,
          }
        : current,
    );
    setPackDetails((current) =>
      current && current.id === packId
        ? {
            ...current,
            ...update,
          }
        : current,
    );
  };

  const handleToggleFavorite = async (
    pack: Pick<RemotePackSummary, "id" | "isFavoritedByMe">,
  ) => {
    try {
      const reaction = await setPackFavorite(pack.id, !pack.isFavoritedByMe);
      applyReactionUpdate(pack.id, reaction);
    } catch (error) {
      toast.error("Could not update favorite", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleToggleHide = async (
    pack: Pick<RemotePackSummary, "id" | "isHiddenByMe">,
  ) => {
    try {
      const reaction = await setPackHidden(pack.id, !pack.isHiddenByMe);
      applyReactionUpdate(pack.id, reaction);
    } catch (error) {
      toast.error("Could not update hide state", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };

  const handleOpenLikers = async (packId: string) => {
    setLikesDialogOpen(true);
    setLikesLoading(true);
    try {
      const response = await getPackFavoriters(packId);
      setLikers(response.users);
    } catch (error) {
      toast.error("Could not load likes", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
      setLikesDialogOpen(false);
    } finally {
      setLikesLoading(false);
    }
  };

  const startDrag = (event: React.DragEvent, item: RemoteDragItem) => {
    event.dataTransfer.setData("octacardRemoteItems", JSON.stringify([item]));
    event.dataTransfer.setData("sourcePane", "remote");
    event.dataTransfer.effectAllowed = "copy";
  };

  const handleClosePack = () => {
    setCurrentPackId(null);
  };

  const handleEditPack = (packId: string) => {
    setEditPackId(packId);
    setEditDialogOpen(true);
  };

  const handleEditDialogClose = (open: boolean) => {
    setEditDialogOpen(open);
    if (!open) setEditPackId(null);
  };

  const handlePackEdited = (packId: string) => {
    getPack(packId)
      .then((details) => {
        onPackCreated?.({
          id: details.id,
          name: details.name,
          coverImageProxyUrl:
            details.coverImageProxyUrl ?? details.coverImageUrl ?? null,
        });
      })
      .catch(() => {
        // Best-effort callback; UI refresh still happens below.
      });

    if (currentPackId === packId) {
      getPack(packId).then((details) =>
        setPackDetails({
          id: details.id,
          ownerId: details.ownerId,
          name: details.name,
          coverImageUrl: details.coverImageProxyUrl ?? details.coverImageUrl,
          creatorName: details.ownerName,
          isOwner: details.isOwner,
          totalSampleCount: details.totalSampleCount,
          totalSizeBytes: details.totalSizeBytes,
          favoriteCount: details.favoriteCount,
          hideCount: details.hideCount,
          isFavoritedByMe: details.isFavoritedByMe,
          isHiddenByMe: details.isHiddenByMe,
          canViewHideCount: details.canViewHideCount,
          canViewLikers: details.canViewLikers,
        }),
      );
      getPackContents(packId).then((contents) =>
        setPackContents({
          pack: contents.pack,
          packs: contents.packs,
          samples: contents.samples,
        }),
      );
    }
    searchRemoteLibrary({ q: query, scope, types: mode, limit: 100 }).then(
      (result) => {
        setPacks(result.packs);
        setSamples(result.samples);
      },
    );
  };

  const handlePackDeleted = (packId: string) => {
    setEditDialogOpen(false);
    setEditPackId(null);
    if (currentPackId === packId) {
      handleClosePack();
    }
    searchRemoteLibrary({ q: query, scope, types: mode, limit: 100 }).then(
      (result) => {
        setPacks(result.packs);
        setSamples(result.samples);
      },
    );
  };

  const isPackView = currentPackId !== null;

  return (
    <div className="flex flex-col h-full bg-background border border-border rounded-lg overflow-hidden">
      {isPackView ? (
        packDetails ? (
          <PackView
            name={packDetails.name}
            coverImageUrl={packDetails.coverImageUrl}
            creatorName={packDetails.creatorName}
            onClose={handleClosePack}
            isOwner={packDetails.isOwner}
            onEdit={
              packDetails.isOwner && currentPackId
                ? () => handleEditPack(currentPackId)
                : undefined
            }
            sampleCount={packDetails.totalSampleCount}
            totalSizeBytes={packDetails.totalSizeBytes}
            reactions={
              <PackReactions
                favoriteCount={packDetails.favoriteCount}
                hideCount={packDetails.hideCount}
                isFavoritedByMe={packDetails.isFavoritedByMe}
                isHiddenByMe={packDetails.isHiddenByMe}
                canViewHideCount={packDetails.canViewHideCount}
                canViewLikers={packDetails.canViewLikers}
                onToggleFavorite={() =>
                  void handleToggleFavorite({
                    id: packDetails.id,
                    isFavoritedByMe: packDetails.isFavoritedByMe,
                  })
                }
                onToggleHide={() =>
                  void handleToggleHide({
                    id: packDetails.id,
                    isHiddenByMe: packDetails.isHiddenByMe,
                  })
                }
                onOpenLikers={() => void handleOpenLikers(packDetails.id)}
              />
            }
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
            <div className="text-xs text-muted-foreground uppercase tracking-wide">
              {scope}
            </div>
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
                <div className="text-sm text-muted-foreground">
                  This pack is empty
                </div>
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
                      onDragStart={(e) =>
                        startDrag(e, {
                          kind: "pack",
                          id: pack.id,
                          name: pack.name,
                          coverImageProxyUrl: pack.coverImageProxyUrl ?? null,
                        })
                      }
                    >
                      <div className="min-w-0 flex items-center gap-2">
                        <div className="w-10 h-10 rounded shrink-0 flex items-center justify-center bg-muted overflow-hidden">
                          {pack.coverImageProxyUrl ? (
                            <img
                              src={pack.coverImageProxyUrl}
                              alt=""
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <Folder className="w-5 h-5 text-amber-600" />
                          )}
                        </div>
                        <div className="truncate">
                          <div className="text-sm truncate">{pack.name}</div>
                          <div className="text-xs text-muted-foreground truncate">
                            {pack.sampleCount}{" "}
                            {pack.sampleCount !== 1 ? "samples" : "sample"}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PackReactions
                          favoriteCount={pack.favoriteCount}
                          hideCount={pack.hideCount}
                          isFavoritedByMe={pack.isFavoritedByMe}
                          isHiddenByMe={pack.isHiddenByMe}
                          canViewHideCount={pack.canViewHideCount}
                          canViewLikers={pack.canViewLikers}
                          onToggleFavorite={() =>
                            void handleToggleFavorite(pack)
                          }
                          onToggleHide={() => void handleToggleHide(pack)}
                          onOpenLikers={() => void handleOpenLikers(pack.id)}
                        />
                        {pack.isOwner && (
                          <div className="text-[10px] uppercase text-primary">
                            Mine
                          </div>
                        )}
                      </div>
                    </PackRow>
                  );
                }

                if (entry.type === "sample" && entry.sample) {
                  const sample = entry.sample;
                  const handleSampleClick = () => {
                    const selection = {
                      path: `remote://sample/${sample.id}`,
                      type: "file" as const,
                      name: sample.name,
                    };
                    queueMicrotask(() => onSelectionChange?.(selection));
                  };
                  return (
                    <PackSampleListRow
                      key={entry.key}
                      name={sample.name}
                      subtitle={joinSampleMetaLine([
                        formatCredits(sample.credits),
                        formatSampleSizeMb(sample.sizeBytes),
                        !sample.canDownload && "locked",
                      ])}
                      playPath={`remote://sample/${sample.id}`}
                      paneType="source"
                      showPlay={sample.canDownload}
                      draggable={sample.canDownload}
                      onDragStart={(e) => {
                        startDrag(e, {
                          kind: "sample",
                          id: sample.id,
                          name: sample.name,
                        });
                      }}
                      onActivate={handleSampleClick}
                      dimmed={!sample.canDownload}
                      trailingActions={
                        !sample.canDownload ? (
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
                                  const contents =
                                    await getPackContents(currentPackId);
                                  setPackContents({
                                    pack: contents.pack,
                                    packs: contents.packs,
                                    samples: contents.samples,
                                  });
                                }
                              } catch (error) {
                                toast.error("Failed to add to collection", {
                                  description:
                                    error instanceof Error
                                      ? error.message
                                      : "Unknown error",
                                });
                              }
                            }}
                          >
                            <ShoppingCart className="h-3 w-3" />
                            Add
                          </Button>
                        ) : undefined
                      }
                      menuContent={
                        <DropdownMenuItem
                          onSelect={() => {
                            setAnalysisSampleId(sample.id);
                            setAnalysisSampleName(sample.name);
                            setAnalysisDialogOpen(true);
                          }}
                        >
                          <BarChart3 className="mr-2 h-4 w-4" />
                          View analysis results
                        </DropdownMenuItem>
                      }
                    />
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
              <div className="text-sm text-muted-foreground">
                No remote results
              </div>
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
                    onDragStart={(e) =>
                      startDrag(e, {
                        kind: "pack",
                        id: pack.id,
                        name: pack.name,
                        coverImageProxyUrl: pack.coverImageProxyUrl ?? null,
                      })
                    }
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <div className="w-10 h-10 rounded shrink-0 flex items-center justify-center bg-muted overflow-hidden">
                        {pack.coverImageProxyUrl ? (
                          <img
                            src={pack.coverImageProxyUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : (
                          <Folder className="w-5 h-5 text-amber-600" />
                        )}
                      </div>
                      <div className="truncate">
                        <div className="text-sm truncate">{pack.name}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {pack.sampleCount}{" "}
                          {pack.sampleCount !== 1 ? "samples" : "sample"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <PackReactions
                        favoriteCount={pack.favoriteCount}
                        hideCount={pack.hideCount}
                        isFavoritedByMe={pack.isFavoritedByMe}
                        isHiddenByMe={pack.isHiddenByMe}
                        canViewHideCount={pack.canViewHideCount}
                        canViewLikers={pack.canViewLikers}
                        onToggleFavorite={() => void handleToggleFavorite(pack)}
                        onToggleHide={() => void handleToggleHide(pack)}
                        onOpenLikers={() => void handleOpenLikers(pack.id)}
                      />
                      {pack.isOwner && (
                        <div className="text-[10px] uppercase text-primary">
                          Mine
                        </div>
                      )}
                    </div>
                  </PackRow>
                );
              }

              if (entry.type === "sample" && entry.sample) {
                const sample = entry.sample;
                const handleSampleClick = () => {
                  const selection = {
                    path: `remote://sample/${sample.id}`,
                    type: "file" as const,
                    name: sample.name,
                  };
                  queueMicrotask(() => onSelectionChange?.(selection));
                };
                return (
                  <PackSampleListRow
                    key={entry.key}
                    name={sample.name}
                    subtitle={joinSampleMetaLine([
                      sample.packName,
                      formatCredits(sample.credits),
                      formatSampleSizeMb(sample.sizeBytes),
                      !sample.canDownload && "locked",
                    ])}
                    playPath={`remote://sample/${sample.id}`}
                    paneType="source"
                    showPlay={sample.canDownload}
                    draggable={sample.canDownload}
                    onDragStart={(e) => {
                      startDrag(e, {
                        kind: "sample",
                        id: sample.id,
                        name: sample.name,
                      });
                    }}
                    onActivate={handleSampleClick}
                    dimmed={!sample.canDownload}
                    trailingActions={
                      !sample.canDownload ? (
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
                                description:
                                  error instanceof Error
                                    ? error.message
                                    : "Unknown error",
                              });
                            }
                          }}
                        >
                          <ShoppingCart className="h-3 w-3" />
                          Add
                        </Button>
                      ) : undefined
                    }
                    menuContent={
                      <DropdownMenuItem
                        onSelect={() => {
                          setAnalysisSampleId(sample.id);
                          setAnalysisSampleName(sample.name);
                          setAnalysisDialogOpen(true);
                        }}
                      >
                        <BarChart3 className="mr-2 h-4 w-4" />
                        View analysis results
                      </DropdownMenuItem>
                    }
                  />
                );
              }

              return null;
            })
          )}
        </div>
      </ScrollArea>
      <CreatePackDialog
        open={editDialogOpen}
        onOpenChange={handleEditDialogClose}
        defaultName=""
        editPackId={editPackId}
        initialCoverImageUrl={
          editPackId === currentPackId && packDetails?.coverImageUrl
            ? packDetails.coverImageUrl
            : undefined
        }
        onCreated={handlePackEdited}
        onDeleted={handlePackDeleted}
      />
      <SampleAnalysisDialog
        open={analysisDialogOpen}
        onOpenChange={setAnalysisDialogOpen}
        sampleId={analysisSampleId}
        sampleName={analysisSampleName}
      />
      <Dialog open={likesDialogOpen} onOpenChange={setLikesDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Users who liked this pack</DialogTitle>
          </DialogHeader>
          {likesLoading ? (
            <div className="py-8 flex items-center justify-center text-sm text-muted-foreground gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading likes...
            </div>
          ) : likers.length === 0 ? (
            <div className="py-6 text-sm text-muted-foreground">
              No likes yet.
            </div>
          ) : (
            <div className="max-h-[50vh] overflow-auto space-y-2">
              {likers.map((liker) => (
                <div
                  key={liker.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-2"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    <Avatar className="h-8 w-8 rounded-md border">
                      <AvatarImage
                        src={liker.image ?? undefined}
                        alt={liker.name}
                        referrerPolicy="no-referrer"
                      />
                      <AvatarFallback className="rounded-md text-xs">
                        {toInitials(liker.name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0">
                      <div className="text-sm truncate">{liker.name}</div>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link to="/profile/$userId" params={{ userId: liker.id }}>
                      Visit
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
