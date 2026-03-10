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
  getPackCoverUploadUrl,
  updatePack,
  checkSamplesExist,
  getSampleUploadUrlByContent,
  createSampleFromContent,
} from "@/lib/remote-library";
import { computeAudioContentHash } from "@/lib/content-hash";
import { fileSystemService } from "@/lib/fileSystem";
import { useSession } from "@/lib/auth-client";
import { toast } from "sonner";
import { Loader2, ImagePlus } from "lucide-react";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const AUDIO_EXT = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i;

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
}

export function CreatePackDialog({
  open,
  onOpenChange,
  defaultName,
  folderPath,
  paneType = "source",
  onCreated,
}: CreatePackDialogProps) {
  const { data: session } = useSession();
  const [name, setName] = useState(defaultName);
  const [isPublic, setIsPublic] = useState(true);
  const [priceTokens, setPriceTokens] = useState(0);
  const [defaultSampleTokens, setDefaultSampleTokens] = useState(0);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ current: number; total: number; phase: string } | null>(null);

  const reset = useCallback(() => {
    setName(defaultName);
    setIsPublic(true);
    setPriceTokens(0);
    setDefaultSampleTokens(0);
    setImageFile(null);
    setImagePreview(null);
    setUploadProgress(null);
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

  const handleImage = useCallback((file: File) => {
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Please use a JPEG, PNG, WebP, or GIF image");
      return;
    }
    setImageFile(file);
    const url = URL.createObjectURL(file);
    setImagePreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
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

  const handleSubmit = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error("Enter a pack name");
      return;
    }
    setLoading(true);
    setUploadProgress(null);

    try {
      const pack = await createPack({
        name: trimmed,
        isPublic,
        priceTokens,
        defaultSampleTokens,
      });

      const totalPhases: string[] = [];
      if (imageFile) totalPhases.push("image");
      if (folderPath) totalPhases.push("samples");
      const phaseCount = totalPhases.length;

      let phaseIndex = 0;

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
        await updatePack(pack.id, { coverImageS3Key: key });
        phaseIndex++;
      }

      if (folderPath) {
        const listResult = await fileSystemService.listAudioFilesRecursively(folderPath, paneType);
        if (!listResult.success || !listResult.data) {
          throw new Error(listResult.error ?? "Failed to list folder");
        }
        const audioEntries = listResult.data.filter((e) => !e.isDirectory && AUDIO_EXT.test(e.name));
        if (audioEntries.length === 0) {
          toast("No audio files found in folder");
        } else {
          setUploadProgress({ current: 0, total: audioEntries.length, phase: "Computing hashes…" });

          const filesWithHashes: Array<{ path: string; name: string; contentHash: string; contentType: string; file: File }> = [];
          for (let i = 0; i < audioEntries.length; i++) {
            setUploadProgress({ current: i, total: audioEntries.length, phase: "Computing hashes…" });
            const entry = audioEntries[i];
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

          setUploadProgress({ current: filesWithHashes.length, total: filesWithHashes.length, phase: "Creating sample records…" });
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

          if (imageFile) {
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
            name: pack.name,
            coverImageS3Key: pack.coverImageS3Key,
            ownerName,
            ...(coverImage && { coverImage }),
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
    folderPath,
    paneType,
    defaultSampleTokens,
    handleOpenChange,
    onCreated,
  ]);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create pack</DialogTitle>
          <DialogDescription>
            {folderPath
              ? "Create a pack from this folder. Samples are deduplicated by content hash."
              : "Create a pack. Add a cover image (optional) — it will be cropped to square."}
          </DialogDescription>
        </DialogHeader>
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
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`relative flex aspect-square w-full max-w-[200px] items-center justify-center rounded-lg border-2 border-dashed transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-muted-foreground/25 bg-muted/30"
              }`}
            >
              {imagePreview ? (
                <>
                  <img
                    src={imagePreview}
                    alt="Cover preview"
                    className="h-full w-full object-cover rounded-md"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="absolute right-2 top-2"
                    onClick={() => {
                      setImageFile(null);
                      setImagePreview((p) => {
                        if (p) URL.revokeObjectURL(p);
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
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating…
              </>
            ) : (
              "Create pack"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
