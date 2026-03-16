/**
 * Project menu: centered dialog. Edit name, upload or generate cover image, save.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { FilePlus, Save, Globe, Lock, Users, ImagePlus, Trash2, Dices, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { fetchUnsplashRandomPhoto } from "@/lib/remote-library";
import { useProjectStore } from "@/stores/project-store";
import { useCurrentProjectStore } from "@/stores/current-project-store";
import { useFormatPresetStore } from "@/stores/format-preset-store";
import { useRoomStore } from "@/stores/room-store";
import { hasLiveblocksConfig } from "@/lib/liveblocks-client";
import { getProjectCoverUploadUrl, canPersistToDb } from "@/lib/project-persistence";
import { cropImageToSquare } from "@/lib/image-utils";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function getProjectCoverDisplayUrl(
  projectId: string | null,
  coverImageS3Key: string | null,
  coverImageUrl: string | null
): string | null {
  if (coverImageS3Key && projectId) {
    return `/api/projects/${encodeURIComponent(projectId)}/cover?v=${encodeURIComponent(coverImageS3Key)}`;
  }
  if (coverImageUrl) return coverImageUrl;
  return null;
}

function getDisplayName(projectName: string, hasProject: boolean): string {
  if (!hasProject) return "OctaCard";
  const trimmed = projectName?.trim();
  if (!trimmed || trimmed === "Untitled") return "OctaCard";
  return trimmed;
}

export function ProjectMenu() {
  const projectId = useProjectStore((s) => s.id);
  const projectName = useProjectStore((s) => s.name);
  const coverImageS3Key = useProjectStore((s) => s.coverImageS3Key);
  const coverImageUrl = useProjectStore((s) => s.coverImageUrl);
  const isPublic = useProjectStore((s) => s.isPublic);
  const setName = useProjectStore((s) => s.setName);
  const setCoverImage = useProjectStore((s) => s.setCoverImage);
  const setIsPublic = useProjectStore((s) => s.setIsPublic);
  const persistToProject = useCurrentProjectStore((s) => s.persistToProject);
  const createNewProject = useCurrentProjectStore((s) => s.createNewProject);
  const { roomId, room, isInRoom } = useRoomStore();

  const [othersCount, setOthersCount] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isUploadingCover, setIsUploadingCover] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [imageSearchQuery, setImageSearchQuery] = useState("");
  const [unsplashLoading, setUnsplashLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const coverDisplayUrl = getProjectCoverDisplayUrl(projectId, coverImageS3Key, coverImageUrl);
  const displayName = getDisplayName(projectName, Boolean(projectId));

  useEffect(() => {
    void canPersistToDb().then(setIsAuthenticated);
  }, []);

  useEffect(() => {
    if (!room) {
      setOthersCount(0);
      return;
    }
    const update = () => setOthersCount(room.getOthers().length);
    update();
    const unsub = room.subscribe("others", update);
    return () => unsub();
  }, [room]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview(null);
      return;
    }
    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  const handleSave = async () => {
    if (!projectId) return;
    setIsSaving(true);
    try {
      await persistToProject();
      toast.success("Project saved");
    } catch {
      toast.error("Failed to save project");
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePublic = async () => {
    const next = !isPublic;
    setIsPublic(next);
    if (projectId) {
      try {
        await persistToProject();
        toast.success(next ? "Project is now public" : "Project is now private");
      } catch {
        toast.error("Failed to update visibility");
        setIsPublic(isPublic);
      }
    }
  };

  const handleUnsplashRandom = useCallback(async () => {
    setUnsplashLoading(true);
    try {
      const query = imageSearchQuery.trim() || projectName.trim() || undefined;
      const result = await fetchUnsplashRandomPhoto(query);
      setImageFile(null);
      setCoverImage(null, result.url);
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
  }, [imageSearchQuery, projectName]);

  const handleCoverFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Please use a JPEG, PNG, WebP, or GIF image");
      return;
    }
    setImageFile(file);
    e.target.value = "";
  };

  const handleUploadCover = async () => {
    if (!projectId || !imageFile) return;
    setIsUploadingCover(true);
    try {
      if (isAuthenticated) {
        const squareBlob = await cropImageToSquare(imageFile);
        const { uploadUrl, key } = await getProjectCoverUploadUrl(projectId, "image/jpeg");
        const res = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: squareBlob,
        });
        if (!res.ok) throw new Error("Failed to upload cover image");
        setCoverImage(key, null);
      } else {
        const squareBlob = await cropImageToSquare(imageFile);
        const reader = new FileReader();
        const dataUrl = await new Promise<string>((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(squareBlob);
        });
        setCoverImage(null, dataUrl);
      }
      setImageFile(null);
      await persistToProject();
      toast.success("Cover image updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload cover");
    } finally {
      setIsUploadingCover(false);
    }
  };

  const handleRemoveCover = async () => {
    if (!projectId) return;
    setCoverImage(null, null);
    setImageFile(null);
    setImagePreview((prev) => {
      if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
      return null;
    });
    try {
      await persistToProject();
      toast.success("Cover image removed");
    } catch {
      toast.error("Failed to remove cover");
    }
  };

  const handleCreateNew = async () => {
    setDialogOpen(false);
    const formatSettings = useFormatPresetStore.getState().currentPreset.settings;
    const project = await createNewProject("Untitled");
    if (project) {
      useFormatPresetStore.getState().hydrateFromProject(formatSettings);
      toast.success("New project created");
    }
  };

  const roomLabel = roomId ?? "—";
  const roomStatus = isInRoom ? "Connected" : "Not in room";
  const hasCover = Boolean(coverDisplayUrl) || Boolean(imagePreview);

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex items-center gap-3 shrink-0 rounded-md px-1 py-1.5 -ml-1",
            "hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
          aria-label="Project settings"
        >
          {coverDisplayUrl ? (
            <img
              src={coverDisplayUrl}
              alt=""
              className="w-8 h-8 rounded object-cover"
              aria-hidden
            />
          ) : (
            <>
              <img src="/favicon.png" alt="" className="w-8 h-8 dark:hidden" aria-hidden />
              <img src="/logo_white.png" alt="" className="w-8 h-8 hidden dark:block" aria-hidden />
            </>
          )}
          <h1 className="text-xl font-bold tracking-tight truncate max-w-[180px]">{displayName}</h1>
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md text-center sm:text-left">
        <DialogHeader className="text-center sm:text-left">
          <DialogTitle>Project settings</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          {projectId ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="project-name">Project name</Label>
                <Input
                  id="project-name"
                  value={projectName}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Untitled"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2">
                <Label>Project image</Label>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search for random image (e.g. music, abstract)"
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
                    disabled={unsplashLoading}
                    title="Generate random image from Unsplash"
                    aria-label="Generate random image"
                  >
                    {unsplashLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Dices className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  className="hidden"
                  onChange={handleCoverFileChange}
                />
                <div className="flex items-start gap-3">
                  <div className="w-20 h-20 rounded-lg border border-border overflow-hidden bg-muted shrink-0">
                    {imagePreview || coverDisplayUrl ? (
                      <img
                        src={imagePreview ?? coverDisplayUrl ?? undefined}
                        alt=""
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <button
                        type="button"
                        className="flex w-full h-full cursor-pointer items-center justify-center text-muted-foreground hover:bg-muted/80 transition-colors"
                        onClick={() => fileInputRef.current?.click()}
                      >
                        <span className="flex flex-col items-center gap-1">
                          <ImagePlus className="w-6 h-6" />
                          <span className="text-xs">Upload</span>
                        </span>
                      </button>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 min-w-0">
                    {!(imagePreview || coverDisplayUrl) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isUploadingCover}
                      >
                        Choose image
                      </Button>
                    )}
                    {(imagePreview || coverDisplayUrl) && (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploadingCover}
                        >
                          {imageFile ? "Change" : "Upload different"}
                        </Button>
                        {imageFile && (
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => void handleUploadCover()}
                            disabled={isUploadingCover}
                          >
                            {isUploadingCover ? "Uploading…" : "Save image"}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => void handleRemoveCover()}
                          disabled={isUploadingCover}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Remove
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isPublic ? (
                    <Globe className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  )}
                  <span>{isPublic ? "Public" : "Private"}</span>
                </div>
                <Switch checked={isPublic} onCheckedChange={() => void handleTogglePublic()} />
              </div>
              {hasLiveblocksConfig() && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Users className="w-4 h-4 text-muted-foreground" />
                    Room
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5 font-mono">
                    <div className="truncate" title={roomLabel}>
                      {roomLabel}
                    </div>
                    <div>{roomStatus}</div>
                    {isInRoom && othersCount > 0 && (
                      <div>
                        {othersCount} other{othersCount === 1 ? "" : "s"} in room
                      </div>
                    )}
                  </div>
                </div>
              )}
              <Button onClick={handleSave} disabled={isSaving} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {isSaving ? "Saving…" : "Save project"}
              </Button>
            </>
          ) : null}
          <Button variant="outline" onClick={handleCreateNew} className="w-full">
            <FilePlus className="w-4 h-4 mr-2" />
            Create new project
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
