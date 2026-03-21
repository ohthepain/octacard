import { Dices, ImagePlus, Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cropImageToSquare } from "@/lib/image-utils";
import {
  createProjectPack,
  getProjectLocalPackCoverDisplayUrl,
  getProjectPackCoverUploadUrl,
  type ProjectLocalPack,
  updateProjectPack,
} from "@/lib/project-packs";
import { fetchUnsplashRandomPhoto } from "@/lib/remote-library";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function unsplashPhotographerUrl(username: string): string {
  return `https://unsplash.com/@${username}?utm_source=octatrack&utm_medium=referral`;
}

export type LocalPackEditorState =
  | { mode: "create"; suggestedName: string }
  | { mode: "edit"; pack: ProjectLocalPack };

interface LocalPackEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  state: LocalPackEditorState | null;
  onSaved: (pack: ProjectLocalPack, mode: "create" | "edit") => void;
}

async function uploadPackCoverFromFile(
  projectId: string,
  packId: string,
  imageFile: File,
): Promise<ProjectLocalPack> {
  const squareBlob = await cropImageToSquare(imageFile);
  const { uploadUrl, key } = await getProjectPackCoverUploadUrl(
    projectId,
    packId,
    "image/jpeg",
  );
  const res = await fetch(uploadUrl, {
    method: "PUT",
    body: squareBlob,
    headers: { "Content-Type": "image/jpeg" },
  });
  if (!res.ok) throw new Error("Failed to upload cover image");
  return updateProjectPack(projectId, packId, {
    coverImageS3Key: key,
    coverImageUrl: null,
  });
}

export function LocalPackEditorDialog({
  open,
  onOpenChange,
  projectId,
  state,
  onSaved,
}: LocalPackEditorDialogProps) {
  const mode = state?.mode ?? "create";
  const isEdit = mode === "edit";

  const [name, setName] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [unsplashImageUrl, setUnsplashImageUrl] = useState<string | null>(null);
  const [unsplashAttribution, setUnsplashAttribution] = useState<{
    photographerName?: string;
    photographerUsername?: string;
  } | null>(null);
  const [clearedCover, setClearedCover] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unsplashLoading, setUnsplashLoading] = useState(false);
  const [imageSearchQuery, setImageSearchQuery] = useState("");

  const resetTransient = useCallback(() => {
    setImageFile(null);
    setUnsplashImageUrl(null);
    setUnsplashAttribution(null);
    setClearedCover(false);
    setIsDragging(false);
    setUnsplashLoading(false);
    setImageSearchQuery("");
    setImagePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  useEffect(() => {
    if (!open || !state || !projectId) return;

    if (state.mode === "create") {
      setName(state.suggestedName);
      resetTransient();
      return;
    }

    const pack = state.pack;
    setName(pack.name);
    setImageFile(null);
    setUnsplashImageUrl(
      pack.coverImageUrl?.startsWith("https://images.unsplash.com")
        ? pack.coverImageUrl
        : null,
    );
    setUnsplashAttribution(null);
    setClearedCover(false);
    const display = getProjectLocalPackCoverDisplayUrl(projectId, pack);
    setImagePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return display;
    });
  }, [open, state, projectId, resetTransient]);

  const handleImage = useCallback((file: File) => {
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Please use a JPEG, PNG, WebP, or GIF image");
      return;
    }
    setImageFile(file);
    setUnsplashImageUrl(null);
    setUnsplashAttribution(null);
    setClearedCover(false);
    const url = URL.createObjectURL(file);
    setImagePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  const handleUnsplashRandom = useCallback(async () => {
    setUnsplashLoading(true);
    try {
      const query = imageSearchQuery.trim() || name.trim() || undefined;
      const result = await fetchUnsplashRandomPhoto(query);
      setImageFile(null);
      setUnsplashImageUrl(result.url);
      setClearedCover(false);
      setUnsplashAttribution(
        result.photographerUsername || result.photographerName
          ? {
              photographerName: result.photographerName,
              photographerUsername: result.photographerUsername,
            }
          : null,
      );
      setImagePreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return result.url;
      });
      if (result.downloadLocation) {
        const key = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as
          | string
          | undefined;
        if (key) {
          fetch(result.downloadLocation, {
            method: "GET",
            headers: { Authorization: `Client-ID ${key}` },
          }).catch(() => {});
        }
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to fetch random image",
      );
    } finally {
      setUnsplashLoading(false);
    }
  }, [imageSearchQuery, name]);

  const handleSave = useCallback(async () => {
    if (!projectId || !state) return;
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a pack name");
      return;
    }

    setLoading(true);
    try {
      if (state.mode === "create") {
        let pack = await createProjectPack(projectId, trimmed);
        if (imageFile) {
          pack = await uploadPackCoverFromFile(projectId, pack.id, imageFile);
        } else if (unsplashImageUrl) {
          pack = await updateProjectPack(projectId, pack.id, {
            coverImageUrl: unsplashImageUrl,
            coverImageS3Key: null,
          });
        }
        onSaved(pack, "create");
        toast.success("Pack created");
        resetTransient();
        setName("");
        onOpenChange(false);
        return;
      }

      const original = state.pack;

      if (imageFile) {
        let next = await uploadPackCoverFromFile(
          projectId,
          original.id,
          imageFile,
        );
        if (trimmed !== original.name) {
          next = await updateProjectPack(projectId, original.id, {
            name: trimmed,
          });
        }
        onSaved(next, "edit");
        toast.success("Pack updated");
        onOpenChange(false);
        return;
      }

      if (
        unsplashImageUrl !== null &&
        unsplashImageUrl !== "" &&
        unsplashImageUrl !== (original.coverImageUrl ?? "")
      ) {
        let next = await updateProjectPack(projectId, original.id, {
          coverImageUrl: unsplashImageUrl,
          coverImageS3Key: null,
        });
        if (trimmed !== original.name) {
          next = await updateProjectPack(projectId, original.id, {
            name: trimmed,
          });
        }
        onSaved(next, "edit");
        toast.success("Pack updated");
        onOpenChange(false);
        return;
      }

      if (
        clearedCover &&
        (original.coverImageS3Key || original.coverImageUrl)
      ) {
        let next = await updateProjectPack(projectId, original.id, {
          coverImageS3Key: null,
          coverImageUrl: null,
        });
        if (trimmed !== original.name) {
          next = await updateProjectPack(projectId, original.id, {
            name: trimmed,
          });
        }
        onSaved(next, "edit");
        toast.success("Pack updated");
        onOpenChange(false);
        return;
      }

      if (trimmed !== original.name) {
        const next = await updateProjectPack(projectId, original.id, {
          name: trimmed,
        });
        onSaved(next, "edit");
        toast.success("Pack updated");
        onOpenChange(false);
        return;
      }

      toast.message("No changes to save");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save pack");
    } finally {
      setLoading(false);
    }
  }, [
    projectId,
    state,
    name,
    imageFile,
    unsplashImageUrl,
    clearedCover,
    onSaved,
    onOpenChange,
    resetTransient,
  ]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleImage(file);
    },
    [handleImage],
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetTransient();
      onOpenChange(next);
    },
    [onOpenChange, resetTransient],
  );

  if (!state) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit local pack" : "New local pack"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the pack name and cover. Changes are saved to your project."
              : "Name your pack and optionally add a square cover image before editing samples."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="local-pack-name">Name</Label>
            <Input
              id="local-pack-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pack name"
              onKeyDown={(e) =>
                e.key === "Enter" && !loading && void handleSave()
              }
            />
          </div>

          <div className="grid gap-2">
            <Label>Cover image</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search term for random image (optional)"
                value={imageSearchQuery}
                onChange={(e) => setImageSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                onClick={() => void handleUnsplashRandom()}
                disabled={unsplashLoading || !projectId}
                title="Get random image from Unsplash"
                aria-label="Get random image from Unsplash"
              >
                {unsplashLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Dices className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              className={`relative flex aspect-square w-full max-w-[200px] shrink-0 items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                isDragging
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/25 bg-muted/30"
              }`}
            >
              {imagePreview ? (
                <>
                  {unsplashAttribution?.photographerUsername ? (
                    <a
                      href={unsplashPhotographerUrl(
                        unsplashAttribution.photographerUsername,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-full w-full rounded-md focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      title={unsplashPhotographerUrl(
                        unsplashAttribution.photographerUsername,
                      )}
                    >
                      <img
                        src={imagePreview}
                        alt="Cover preview"
                        className="h-full w-full rounded-md object-cover"
                        referrerPolicy="no-referrer"
                      />
                    </a>
                  ) : (
                    <img
                      src={imagePreview}
                      alt="Cover preview"
                      className="h-full w-full rounded-md object-cover"
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="absolute right-2 top-2"
                    onClick={() => {
                      setImageFile(null);
                      setUnsplashImageUrl(null);
                      setUnsplashAttribution(null);
                      setClearedCover(true);
                      setImagePreview((p) => {
                        if (p?.startsWith("blob:")) URL.revokeObjectURL(p);
                        return null;
                      });
                    }}
                  >
                    Remove
                  </Button>
                </>
              ) : (
                <label className="flex cursor-pointer flex-col items-center gap-2 p-4 text-center text-sm text-muted-foreground">
                  <ImagePlus className="h-8 w-8" />
                  <span>Drag an image here or click to browse</span>
                  <input
                    type="file"
                    accept={IMAGE_TYPES.join(",")}
                    className="sr-only"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImage(file);
                      e.target.value = "";
                    }}
                  />
                </label>
              )}
            </div>
            {unsplashAttribution &&
              (unsplashAttribution.photographerName ||
                unsplashAttribution.photographerUsername) && (
                <p className="text-xs text-muted-foreground">
                  {unsplashAttribution.photographerUsername ? (
                    <a
                      href={unsplashPhotographerUrl(
                        unsplashAttribution.photographerUsername,
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      Photo by{" "}
                      {unsplashAttribution.photographerName ||
                        unsplashAttribution.photographerUsername}{" "}
                      / Unsplash
                    </a>
                  ) : (
                    <span>
                      Photo by {unsplashAttribution.photographerName} / Unsplash
                    </span>
                  )}
                </p>
              )}
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSave()}
            disabled={loading || !projectId}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : isEdit ? (
              "Save"
            ) : (
              "Create pack"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
