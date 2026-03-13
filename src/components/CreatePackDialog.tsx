import { useState, useCallback, useEffect } from "react";
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
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import {
  createPack,
  getPack,
  getPackCoverUploadUrl,
  updatePack,
  checkSamplesExist,
  getSampleUploadUrlByContent,
  createSampleFromContent,
  fetchUnsplashRandomPhoto,
} from "@/lib/remote-library";
import { computeAudioContentHash } from "@/lib/content-hash";
import { fileSystemService } from "@/lib/fileSystem";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { Loader2, ImagePlus, Dices } from "lucide-react";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function unsplashPhotographerUrl(username: string): string {
  return `https://unsplash.com/@${username}?utm_source=octatrack&utm_medium=referral`;
}
const AUDIO_EXT = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i;
const UNKNOWN_FILE_MAX_BYTES = 1024 * 1024;
const UNKNOWN_FILE_MAX_COUNT = 10;
const SERVER_EXCLUDED_FILE_PATTERNS = ["*.asd"] as const;

function getContentTypeFromFileName(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase();
  const map: Record<string, string> = {
    wav: "audio/wav",
    aiff: "audio/aiff",
    aif: "audio/aiff",
    mp3: "audio/mpeg",
    flac: "audio/flac",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wma: "audio/wma",
  };
  return ext ? map[ext] ?? "application/octet-stream" : "application/octet-stream";
}

function isExcludedByServerPattern(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return SERVER_EXCLUDED_FILE_PATTERNS.some((pattern) => {
    const lowerPattern = pattern.toLowerCase();
    if (lowerPattern.startsWith("*.")) {
      return lowerName.endsWith(lowerPattern.slice(1));
    }
    return lowerName === lowerPattern;
  });
}

function cropImageToSquare(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const size = Math.min(img.width, img.height);
      const x = (img.width - size) / 2;
      const y = (img.height - size) / 2;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Could not get canvas context"));
        return;
      }
      ctx.drawImage(img, x, y, size, size, 0, 0, size, size);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Failed to create blob"));
        },
        "image/jpeg",
        0.9
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });
}

interface CreatePackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName: string;
  folderPath?: string;
  paneType?: "source" | "dest";
  onCreated?: (packId: string) => void;
  /** When set, dialog opens in edit mode for this pack */
  editPackId?: string | null;
  /** Pre-loaded cover URL when editing (e.g. from pack view) - avoids async fetch delay */
  initialCoverImageUrl?: string | null;
}

export function CreatePackDialog({
  open,
  onOpenChange,
  defaultName,
  folderPath,
  paneType = "source",
  onCreated,
  editPackId,
  initialCoverImageUrl,
}: CreatePackDialogProps) {
  const { data: session } = useSession();
  const isEditMode = Boolean(editPackId);
  const [name, setName] = useState(defaultName);
  const [isPublic, setIsPublic] = useState(true);
  const [priceTokens, setPriceTokens] = useState(0);
  const [defaultSampleTokens, setDefaultSampleTokens] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; phase: string } | null>(null);
  const [editLoadError, setEditLoadError] = useState<string | null>(null);
  const [createAsCopy, setCreateAsCopy] = useState(false);
  const [unsplashLoading, setUnsplashLoading] = useState(false);
  const [imageSearchQuery, setImageSearchQuery] = useState("");
  const [unsplashImageUrl, setUnsplashImageUrl] = useState<string | null>(null);
  const [unsplashAttribution, setUnsplashAttribution] = useState<{
    photographerName?: string;
    photographerUsername?: string;
    downloadLocation?: string;
  } | null>(null);

  const reset = useCallback(() => {
    setName(defaultName);
    setIsPublic(true);
    setPriceTokens(0);
    setDefaultSampleTokens(0);
    setImageFile(null);
    setImagePreview(null);
    setUnsplashImageUrl(null);
    setUploadProgress(null);
    setEditLoadError(null);
    setCreateAsCopy(false);
    setUnsplashLoading(false);
    setImageSearchQuery("");
    setUnsplashAttribution(null);
  }, [defaultName]);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  useEffect(() => {
    if (open) setName(defaultName);
  }, [open, defaultName]);

  useEffect(() => {
    if (!open || !editPackId) return;
    setEditLoadError(null);
    setImageFile(null);
    setUnsplashImageUrl(null);
    setUnsplashAttribution(null);
    setCreateAsCopy(false);
    if (initialCoverImageUrl) {
      setImagePreview(initialCoverImageUrl);
    }
    const loadingId = editPackId;
    getPack(editPackId)
      .then((pack) => {
        if (loadingId !== editPackId) return;
        setName(pack.name);
        setIsPublic(pack.isPublic);
        setPriceTokens(pack.priceTokens);
        setDefaultSampleTokens(pack.defaultSampleTokens);
        if (!initialCoverImageUrl) {
          const previewUrl = pack.coverImageProxyUrl ?? pack.coverImageUrl ?? null;
          setImagePreview(previewUrl);
          if (pack.coverImageUrl && pack.coverImageUrl.startsWith("https://images.unsplash.com")) {
            setUnsplashImageUrl(pack.coverImageUrl);
          }
        }
      })
      .catch(async (err) => {
        if (loadingId !== editPackId) return;
        if (folderPath && paneType) {
          setName(defaultName);
          try {
            const base = folderPath.replace(/\/$/, "");
            const packJsonPath = base ? `${base}/pack.json` : "pack.json";
            const file = await fileSystemService.getFile(packJsonPath, paneType);
            if (file) {
              const data = JSON.parse(await file.text()) as { name?: string; coverImage?: string };
              if (data.name?.trim()) setName(data.name.trim());
              if (data.coverImage) {
                const coverPath = base ? `${base}/${data.coverImage}` : data.coverImage;
                const coverFile = await fileSystemService.getFile(coverPath, paneType);
                if (coverFile) {
                  const blob = await coverFile.blob();
                  const ext = data.coverImage.match(/\.(jpe?g|png|webp|gif)$/i)?.[0]?.slice(1) ?? "jpg";
                  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
                  const coverImgFile = new File([blob], `cover.${ext}`, { type: mime });
                  setImageFile(coverImgFile);
                  const url = URL.createObjectURL(blob);
                  setImagePreview((prev) => {
                    if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
                    return url;
                  });
                }
              }
            }
          } catch {
            // Use defaultName, continue to create-as-copy
          }
          setCreateAsCopy(true);
          return;
        }
        setEditLoadError(err instanceof Error ? err.message : "Failed to load pack");
      });
  }, [open, editPackId, folderPath, paneType, defaultName, initialCoverImageUrl]);

  const handleImage = useCallback((file: File, attribution?: { photographerName?: string; photographerUsername?: string; downloadLocation?: string } | null) => {
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Please use a JPEG, PNG, WebP, or GIF image");
      return;
    }
    setImageFile(file);
    setUnsplashImageUrl(null);
    setUnsplashAttribution(attribution ?? null);
    const url = URL.createObjectURL(file);
    setImagePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return url;
    });
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleImage(file);
    },
    [handleImage]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImage(file);
      e.target.value = "";
    },
    [handleImage]
  );

  const handleUnsplashRandom = useCallback(async () => {
    setUnsplashLoading(true);
    try {
      const query = imageSearchQuery.trim() || name.trim() || undefined;
      const result = await fetchUnsplashRandomPhoto(query);
      setImageFile(null);
      setUnsplashImageUrl(result.url);
      setUnsplashAttribution(
        result.photographerUsername || result.photographerName || result.downloadLocation
          ? {
              photographerName: result.photographerName,
              photographerUsername: result.photographerUsername,
              downloadLocation: result.downloadLocation,
            }
          : null
      );
      setImagePreview((prev) => {
        if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
        return result.url;
      });
      if (result.downloadLocation) {
        const key = import.meta.env.VITE_UNSPLASH_ACCESS_KEY as string | undefined;
        if (key) {
          fetch(result.downloadLocation, {
            method: "GET",
            headers: { Authorization: `Client-ID ${key}` },
          }).catch(() => {});
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch random image");
    } finally {
      setUnsplashLoading(false);
    }
  }, [imageSearchQuery, name]);

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a pack name");
      return;
    }
    setLoading(true);
    setUploadProgress(null);

    try {
      let packId: string;

      if (isEditMode && editPackId && !createAsCopy) {
        packId = editPackId;
        let coverImageS3Key: string | undefined;
        let coverImageUrl: string | null | undefined;
        let squareBlob: Blob | null = null;
        if (unsplashImageUrl) {
          coverImageUrl = unsplashImageUrl;
          coverImageS3Key = null;
        } else if (imageFile) {
          setUploadProgress({ current: 0, total: 1, phase: "Uploading cover image…" });
          squareBlob = await cropImageToSquare(imageFile);
          const { uploadUrl, key } = await getPackCoverUploadUrl(packId, "image/jpeg");
          const res = await fetch(uploadUrl, {
            method: "PUT",
            body: squareBlob,
            headers: { "Content-Type": "image/jpeg" },
          });
          if (!res.ok) throw new Error("Failed to upload cover image");
          coverImageS3Key = key;
          coverImageUrl = null;
        }
        await updatePack(packId, {
          name: trimmed,
          isPublic,
          priceTokens,
          defaultSampleTokens,
          ...(coverImageS3Key !== undefined && { coverImageS3Key }),
          ...(coverImageUrl !== undefined && { coverImageUrl }),
        });
        setUploadProgress(null);

        if (folderPath && paneType && (imageFile || unsplashImageUrl)) {
          try {
            const ownerName = session?.user?.name ?? "Unknown";
            const joinPath = (base: string, file: string) =>
              base.replace(/\/$/, "") + (base ? "/" : "") + file;
            const packJsonPath = joinPath(folderPath, "pack.json");
            const existingFile = await fileSystemService.getFile(packJsonPath, paneType);
            let packJson: Record<string, unknown> = {
              packId,
              name: trimmed,
              coverImageS3Key: coverImageS3Key ?? null,
              ownerName,
              ...(unsplashImageUrl && { coverImageUrl: unsplashImageUrl }),
            };
            if (existingFile) {
              try {
                const existing = JSON.parse(await existingFile.text()) as Record<string, unknown>;
                packJson = { ...existing, ...packJson };
              } catch {
                // use new packJson
              }
            }
            packJson.name = trimmed;
            if (coverImageS3Key) packJson.coverImageS3Key = coverImageS3Key;
            if (unsplashImageUrl) {
              packJson.coverImageUrl = unsplashImageUrl;
              delete packJson.coverImage;
            } else if (imageFile && squareBlob) {
              const ext = imageFile.type?.includes("png") ? "png" : "jpg";
              const coverImage = `cover.${ext}`;
              packJson.coverImage = coverImage;
              await fileSystemService.writeBlobToPath(
                joinPath(folderPath, coverImage),
                squareBlob,
                paneType,
              );
            }
            await fileSystemService.writeBlobToPath(
              packJsonPath,
              new Blob([JSON.stringify(packJson, null, 2)], { type: "application/json" }),
              paneType,
            );
          } catch (err) {
            console.warn("Failed to write pack to folder:", err);
          }
        }

        toast.success("Pack updated");
        handleOpenChange(false);
        onCreated?.(packId);
        return;
      }

      const pack = await createPack({
        name: trimmed,
        isPublic,
        priceTokens,
        defaultSampleTokens,
        ...(unsplashImageUrl && { coverImageUrl: unsplashImageUrl }),
      });
      packId = pack.id;

      const totalPhases: string[] = [];
      if (imageFile) totalPhases.push("image");
      if (folderPath) totalPhases.push("samples");
      let _phaseIndex = 0;

      if (imageFile) {
        setUploadProgress({ current: 0, total: 1, phase: "Uploading cover image…" });
        const squareBlob = await cropImageToSquare(imageFile);
        const { uploadUrl, key } = await getPackCoverUploadUrl(pack.id, "image/jpeg");
        const res = await fetch(uploadUrl, {
          method: "PUT",
          body: squareBlob,
          headers: { "Content-Type": "image/jpeg" },
        });
        if (!res.ok) throw new Error("Failed to upload cover image");
        await updatePack(pack.id, { coverImageS3Key: key, coverImageUrl: null });
        _phaseIndex++;
      }

      if (folderPath) {
        const allFiles: Array<{ path: string; name: string; size: number }> = [];
        const collectFilesRecursively = async (path: string) => {
          const result = await fileSystemService.readDirectory(path, paneType);
          if (!result.success || !result.data) {
            throw new Error(result.error ?? `Failed to list ${path}`);
          }
          for (const entry of result.data) {
            if (entry.isDirectory) {
              await collectFilesRecursively(entry.path);
              continue;
            }
            allFiles.push({ path: entry.path, name: entry.name, size: entry.size });
          }
        };

        await collectFilesRecursively(folderPath);

        const includedFiles = allFiles.filter((entry) => !isExcludedByServerPattern(entry.name));
        const audioEntries = includedFiles.filter((entry) => AUDIO_EXT.test(entry.name));
        const unknownEntries = includedFiles.filter((entry) => !AUDIO_EXT.test(entry.name));

        const unknownTooLargeEntries = unknownEntries.filter((entry) => entry.size > UNKNOWN_FILE_MAX_BYTES);
        let acceptedUnknownEntries = unknownEntries.filter((entry) => entry.size <= UNKNOWN_FILE_MAX_BYTES);
        const unknownIgnoredForCount = unknownEntries.length > UNKNOWN_FILE_MAX_COUNT;
        if (unknownIgnoredForCount) {
          acceptedUnknownEntries = [];
        }

        if (unknownTooLargeEntries.length > 0 || unknownIgnoredForCount) {
          const reason = unknownIgnoredForCount
            ? `More than ${UNKNOWN_FILE_MAX_COUNT} files of unknown type were found, so all unknown-type files were ignored.`
            : `${unknownTooLargeEntries.length} file${unknownTooLargeEntries.length === 1 ? "" : "s"} of unknown type exceeded 1MB and were ignored.`;
          toast.error("Some files were ignored", { description: reason });
        }

        const uploadEntries = [...audioEntries, ...acceptedUnknownEntries];
        if (uploadEntries.length === 0) {
          toast("No uploadable files found in folder");
        } else {
          setUploadProgress({ current: 0, total: uploadEntries.length, phase: "Computing hashes…" });

          const filesWithHashes: Array<{ path: string; name: string; contentHash: string; contentType: string; file: File }> = [];
          for (let i = 0; i < uploadEntries.length; i++) {
            setUploadProgress({ current: i, total: uploadEntries.length, phase: "Computing hashes…" });
            const entry = uploadEntries[i];
            const file = await fileSystemService.getFile(entry.path, paneType);
            if (!file) continue;
            const contentHash = await computeAudioContentHash(file);
            filesWithHashes.push({
              path: entry.path,
              name: entry.name,
              contentHash,
              contentType: getContentTypeFromFileName(entry.name),
              file,
            });
          }

          const contentHashes = filesWithHashes.map((f) => f.contentHash);
          const { missing } = await checkSamplesExist(contentHashes);

          const toUpload = filesWithHashes.filter((f) => missing.includes(f.contentHash));
          const totalUploads = toUpload.length;

          for (let i = 0; i < toUpload.length; i++) {
            const item = toUpload[i];
            setUploadProgress({
              current: i,
              total: totalUploads,
              phase: `Uploading ${item.name}…`,
            });
            const { uploadUrl } = await getSampleUploadUrlByContent({
              packId: pack.id,
              contentHash: item.contentHash,
              contentType: item.contentType,
              fileName: item.name,
            });
            const res = await fetch(uploadUrl, {
              method: "PUT",
              body: item.file,
              headers: { "Content-Type": item.contentType },
            });
            if (!res.ok) throw new Error(`Failed to upload ${item.name}`);
          }

          setUploadProgress({ current: filesWithHashes.length, total: filesWithHashes.length, phase: "Creating file records…" });
          for (let i = 0; i < filesWithHashes.length; i++) {
            const item = filesWithHashes[i];
            await createSampleFromContent({
              packId: pack.id,
              name: item.name,
              contentHash: item.contentHash,
              contentType: item.contentType,
              sizeBytes: item.file.size,
              credits: defaultSampleTokens,
            });
          }
        }
      }

      setUploadProgress(null);

      // Write pack.json and cover to the folder when creating from a folder
      if (folderPath && paneType) {
        try {
          const ownerName = session?.user?.name ?? "Unknown";
          let coverImage: string | null = null;

          const joinPath = (base: string, file: string) =>
            base.replace(/\/$/, "") + (base ? "/" : "") + file;

          if (unsplashImageUrl) {
            // Hotlink: store URL in pack.json only
          } else if (imageFile) {
            const ext = imageFile.type?.includes("png") ? "png" : "jpg";
            coverImage = `cover.${ext}`;
            const coverBlob = await cropImageToSquare(imageFile);
            const coverResult = await fileSystemService.writeBlobToPath(
              joinPath(folderPath, coverImage),
              coverBlob,
              paneType,
            );
            if (!coverResult.success) coverImage = null;
          }

          const packJson = {
            packId: pack.id,
            name: pack.name,
            coverImageS3Key: pack.coverImageS3Key ?? null,
            ownerName,
            ...(coverImage && { coverImage }),
            ...(unsplashImageUrl && { coverImageUrl: unsplashImageUrl }),
          };
          const packJsonBlob = new Blob([JSON.stringify(packJson, null, 2)], {
            type: "application/json",
          });
          await fileSystemService.writeBlobToPath(
            joinPath(folderPath, "pack.json"),
            packJsonBlob,
            paneType,
          );
        } catch (err) {
          console.warn("Failed to write pack.json to folder:", err);
        }
      }

      toast.success("Pack created");
      handleOpenChange(false);
      onCreated?.(pack.id);
    } catch (err) {
      setUploadProgress(null);
      toast.error(err instanceof Error ? err.message : "Failed to create pack");
    } finally {
      setLoading(false);
    }
  }, [
    name,
    isPublic,
    priceTokens,
    defaultSampleTokens,
    imageFile,
    unsplashImageUrl,
    folderPath,
    paneType,
    handleOpenChange,
    onCreated,
    isEditMode,
    editPackId,
    createAsCopy,
    session?.user?.name,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "Edit pack" : "Create pack"}</DialogTitle>
          <DialogDescription>
            {createAsCopy
              ? "Pack not found in this environment. Saving will create a copy with the samples from this folder. Analysis will run on the samples."
              : isEditMode
              ? "Update pack metadata and cover image."
              : folderPath
                ? "Create a pack from this folder. Files are deduplicated by content hash."
                : "Create a pack. Add a cover image (optional) — it will be cropped to square."}
          </DialogDescription>
        </DialogHeader>
        {editLoadError && (
          <p className="text-sm text-destructive">{editLoadError}</p>
        )}
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="pack-name">Name</Label>
            <Input
              id="pack-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Pack name"
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Public</Label>
              <p className="text-xs text-muted-foreground">Visible to others in the library</p>
            </div>
            <Switch checked={isPublic} onCheckedChange={setIsPublic} />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="pack-price">Pack price (tokens)</Label>
            <Input
              id="pack-price"
              type="number"
              min={0}
              value={priceTokens}
              onChange={(e) => setPriceTokens(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="default-sample-price">Default sample price (tokens)</Label>
            <Input
              id="default-sample-price"
              type="number"
              min={0}
              value={defaultSampleTokens}
              onChange={(e) => setDefaultSampleTokens(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>

          <div className="grid gap-2">
            <Label>Cover image</Label>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search term for random image (e.g. music, abstract)"
                value={imageSearchQuery}
                onChange={(e) => setImageSearchQuery(e.target.value)}
                className="flex-1"
              />
              <Button
                type="button"
                size="icon"
                variant="outline"
                className="h-9 w-9 shrink-0"
                onClick={handleUnsplashRandom}
                disabled={unsplashLoading}
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
            <div className="flex items-start gap-2">
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                className={`relative flex aspect-square w-full max-w-[200px] shrink-0 items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                  isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/30"
                }`}
              >
                {imagePreview ? (
                  <>
                    {unsplashAttribution?.photographerUsername ? (
                      <a
                        href={unsplashPhotographerUrl(unsplashAttribution.photographerUsername)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block h-full w-full focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md"
                        title={unsplashPhotographerUrl(unsplashAttribution.photographerUsername)}
                      >
                        <img
                          src={imagePreview}
                          alt="Cover preview"
                          className="h-full w-full object-cover rounded-md"
                          referrerPolicy="no-referrer"
                        />
                      </a>
                    ) : (
                      <img
                        src={imagePreview}
                        alt="Cover preview"
                        className="h-full w-full object-cover rounded-md"
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
                      onChange={handleFileInput}
                    />
                  </label>
                )}
              </div>
            </div>
            {unsplashAttribution && (unsplashAttribution.photographerName || unsplashAttribution.photographerUsername) && (
              <p className="text-xs text-muted-foreground">
                {unsplashAttribution.photographerUsername ? (
                  <a
                    href={unsplashPhotographerUrl(unsplashAttribution.photographerUsername)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground"
                  >
                    Photo by {unsplashAttribution.photographerName || unsplashAttribution.photographerUsername} / Unsplash
                  </a>
                ) : (
                  <span>Photo by {unsplashAttribution.photographerName} / Unsplash</span>
                )}
              </p>
            )}
          </div>

          {uploadProgress && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">{uploadProgress.phase}</p>
              <Progress
                value={
                  uploadProgress.total > 0 ? (uploadProgress.current / uploadProgress.total) * 100 : 0
                }
                className="h-2"
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || Boolean(editLoadError)}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {createAsCopy ? "Creating…" : isEditMode ? "Saving…" : "Creating…"}
              </>
            ) : (
              createAsCopy ? "Create copy" : isEditMode ? "Save" : "Create pack"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
