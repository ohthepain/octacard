import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { GripVertical, Loader2, Plus, Tags, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSession, isAdminOrSuperadmin } from "@/lib/auth-client";
import {
  addInstrumentFamily,
  addInstrumentType,
  getAdminTaxonomy,
  removeInstrumentFamily,
  removeInstrumentType,
  reorderInstrumentFamilies,
  reorderInstrumentTypes,
  type AdminTaxonomyState,
} from "@/lib/admin-taxonomy";

function reorderList<T>(list: T[], fromIndex: number, toIndex: number): T[] {
  const copy = [...list];
  const [moved] = copy.splice(fromIndex, 1);
  copy.splice(toIndex, 0, moved);
  return copy;
}

export default function AdminTaxonomy() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [state, setState] = useState<AdminTaxonomyState>({ families: [] });
  const [newFamilyKey, setNewFamilyKey] = useState("");
  const [newTypeByFamilyId, setNewTypeByFamilyId] = useState<Record<string, string>>({});
  const [draggingFamilyId, setDraggingFamilyId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<{ familyId: string; typeId: string } | null>(null);

  useEffect(() => {
    if (isPending) return;
    if (!isAdminOrSuperadmin(session)) {
      navigate({ to: "/" });
    }
  }, [session, isPending, navigate]);

  useEffect(() => {
    if (isPending || !isAdminOrSuperadmin(session)) return;
    let canceled = false;
    (async () => {
      setLoading(true);
      try {
        const data = await getAdminTaxonomy();
        if (!canceled) setState(data);
      } catch (error) {
        if (!canceled) {
          toast.error("Failed to load taxonomy", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        }
      } finally {
        if (!canceled) setLoading(false);
      }
    })();

    return () => {
      canceled = true;
    };
  }, [session, isPending]);

  const hasFamilies = useMemo(() => state.families.length > 0, [state.families.length]);

  if (isPending || !isAdminOrSuperadmin(session)) return null;

  const handleAddFamily = async () => {
    if (!newFamilyKey.trim()) return;
    setBusyKey("add-family");
    try {
      const updated = await addInstrumentFamily(newFamilyKey);
      setState(updated);
      setNewFamilyKey("");
      toast.success("Family added");
    } catch (error) {
      toast.error("Failed to add family", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemoveFamily = async (familyId: string) => {
    setBusyKey(`remove-family:${familyId}`);
    try {
      const updated = await removeInstrumentFamily(familyId);
      setState(updated);
      toast.success("Family removed");
    } catch (error) {
      toast.error("Failed to remove family", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddType = async (familyId: string) => {
    const key = newTypeByFamilyId[familyId]?.trim();
    if (!key) return;
    setBusyKey(`add-type:${familyId}`);
    try {
      const updated = await addInstrumentType(familyId, key);
      setState(updated);
      setNewTypeByFamilyId((prev) => ({ ...prev, [familyId]: "" }));
      toast.success("Type added");
    } catch (error) {
      toast.error("Failed to add type", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleRemoveType = async (familyId: string, typeId: string) => {
    setBusyKey(`remove-type:${familyId}:${typeId}`);
    try {
      const updated = await removeInstrumentType(familyId, typeId);
      setState(updated);
      toast.success("Type removed");
    } catch (error) {
      toast.error("Failed to remove type", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusyKey(null);
    }
  };

  const handleReorderFamilies = async (targetFamilyId: string) => {
    if (!draggingFamilyId || busyKey !== null || draggingFamilyId === targetFamilyId) return;

    const fromIndex = state.families.findIndex((family) => family.id === draggingFamilyId);
    const toIndex = state.families.findIndex((family) => family.id === targetFamilyId);
    if (fromIndex < 0 || toIndex < 0) return;

    const reorderedFamilies = reorderList(state.families, fromIndex, toIndex);
    setState((prev) => ({ ...prev, families: reorderedFamilies }));
    setBusyKey("reorder-families");

    try {
      const updated = await reorderInstrumentFamilies(reorderedFamilies.map((family) => family.id));
      setState(updated);
    } catch (error) {
      const fallback = await getAdminTaxonomy();
      setState(fallback);
      toast.error("Failed to reorder families", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusyKey(null);
      setDraggingFamilyId(null);
    }
  };

  const handleReorderTypes = async (targetFamilyId: string, targetTypeId: string) => {
    if (!draggingType || busyKey !== null) return;
    if (draggingType.familyId !== targetFamilyId || draggingType.typeId === targetTypeId) return;

    const family = state.families.find((item) => item.id === targetFamilyId);
    if (!family) return;

    const fromIndex = family.types.findIndex((type) => type.id === draggingType.typeId);
    const toIndex = family.types.findIndex((type) => type.id === targetTypeId);
    if (fromIndex < 0 || toIndex < 0) return;

    const reorderedTypes = reorderList(family.types, fromIndex, toIndex);
    const updatedFamilies = state.families.map((item) =>
      item.id === targetFamilyId ? { ...item, types: reorderedTypes } : item,
    );

    setState((prev) => ({ ...prev, families: updatedFamilies }));
    setBusyKey(`reorder-types:${targetFamilyId}`);

    try {
      const updated = await reorderInstrumentTypes(
        targetFamilyId,
        reorderedTypes.map((type) => type.id),
      );
      setState(updated);
    } catch (error) {
      const fallback = await getAdminTaxonomy();
      setState(fallback);
      toast.error("Failed to reorder types", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusyKey(null);
      setDraggingType(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-4xl py-12 px-4 space-y-6">
        <div>
          <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to admin
          </Link>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Tags className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold">Taxonomy Editor</h1>
          </div>
          <p className="text-muted-foreground">
            Manage instrument families and nested instrument types used by sample taxonomy.
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4 space-y-3">
          <div className="text-sm font-medium">Add instrument family</div>
          <div className="flex gap-2">
            <Input
              value={newFamilyKey}
              onChange={(e) => setNewFamilyKey(e.target.value)}
              placeholder="e.g. percussion"
              disabled={busyKey !== null}
            />
            <Button onClick={handleAddFamily} disabled={busyKey !== null || !newFamilyKey.trim()} className="gap-2">
              {busyKey === "add-family" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="rounded-lg border bg-card p-8 flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading taxonomy...
          </div>
        ) : !hasFamilies ? (
          <div className="rounded-lg border bg-card p-8 text-sm text-muted-foreground text-center">
            No instrument families yet.
          </div>
        ) : (
          <div className="space-y-4">
            {state.families.map((family) => (
              <div
                key={family.id}
                draggable={busyKey === null}
                onDragStart={() => setDraggingFamilyId(family.id)}
                onDragEnd={() => setDraggingFamilyId(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => void handleReorderFamilies(family.id)}
                className="rounded-lg border bg-card p-4 space-y-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex items-center gap-2">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab shrink-0" />
                    <div>
                      <div className="font-medium">{family.key}</div>
                      <div className="text-xs text-muted-foreground">
                        {family.types.length} type{family.types.length === 1 ? "" : "s"}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={() => handleRemoveFamily(family.id)}
                    disabled={busyKey !== null}
                  >
                    {busyKey === `remove-family:${family.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                    Remove family
                  </Button>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium">Instrument types</div>
                  <div className="flex gap-2">
                    <Input
                      value={newTypeByFamilyId[family.id] ?? ""}
                      onChange={(e) =>
                        setNewTypeByFamilyId((prev) => ({
                          ...prev,
                          [family.id]: e.target.value,
                        }))
                      }
                      placeholder="e.g. snare"
                      disabled={busyKey !== null}
                    />
                    <Button
                      onClick={() => handleAddType(family.id)}
                      disabled={busyKey !== null || !(newTypeByFamilyId[family.id] ?? "").trim()}
                      className="gap-2"
                    >
                      {busyKey === `add-type:${family.id}` ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                      Add type
                    </Button>
                  </div>
                  {family.types.length === 0 ? (
                    <div className="text-xs text-muted-foreground">No types for this family yet.</div>
                  ) : (
                    <div className="space-y-2">
                      {family.types.map((type) => (
                        <div
                          key={type.id}
                          draggable={busyKey === null}
                          onDragStart={() => setDraggingType({ familyId: family.id, typeId: type.id })}
                          onDragEnd={() => setDraggingType(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => void handleReorderTypes(family.id, type.id)}
                          className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1.5 text-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <GripVertical className="h-3.5 w-3.5 text-muted-foreground cursor-grab shrink-0" />
                            <span className="truncate">{type.key}</span>
                          </div>
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => handleRemoveType(family.id, type.id)}
                            disabled={busyKey !== null}
                            aria-label={`Remove type ${type.key}`}
                          >
                            {busyKey === `remove-type:${family.id}:${type.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
