import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { ImagePlus, Loader2, Sparkles, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cropImageToSquare } from "@/lib/image-utils";
import {
  fetchUnsplashRandomPhoto,
  getMyProfile,
  getMyProfileStats,
  updateMyProfile,
  type UserProfileStats,
} from "@/lib/remote-library";
import { Link } from "@tanstack/react-router";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

type ProfileDialogProps = {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  fallbackName: string;
  fallbackEmail: string;
  fallbackImage: string | null;
  userId: string;
  onSaved: (profile: { name: string; image: string | null }) => void;
};

function toInitials(name: string, email: string): string {
  const source = name.trim() || email.trim();
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

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("Failed to read image file"));
    reader.readAsDataURL(blob);
  });
}

function sanitizeTerms(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

function toTitleCase(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function buildUnsplashQuery(answer: string, fallbackName: string): string {
  const answerTerms = sanitizeTerms(answer);
  const fallbackTerms = sanitizeTerms(fallbackName);
  const merged = [...answerTerms, ...fallbackTerms, "portrait", "creative", "photo"];
  const deduped = Array.from(new Set(merged));
  return (deduped.slice(0, 10).join(" ") || "creative portrait photo").trim();
}

export function ProfileDialog({
  open,
  onOpenChange,
  fallbackName,
  fallbackEmail,
  fallbackImage,
  userId,
  onSaved,
}: ProfileDialogProps) {
  const [name, setName] = useState(fallbackName);
  const [email, setEmail] = useState(fallbackEmail);
  const [image, setImage] = useState<string | null>(fallbackImage);
  const [stats, setStats] = useState<UserProfileStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [unsplashLoading, setUnsplashLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initials = useMemo(() => toInitials(name, email), [name, email]);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [profile, profileStats] = await Promise.all([getMyProfile(), getMyProfileStats()]);
      setName(toTitleCase(profile.name || fallbackName));
      setEmail(profile.email || fallbackEmail);
      setImage(profile.image ?? fallbackImage ?? null);
      setStats(profileStats);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load profile");
    } finally {
      setLoading(false);
    }
  }, [fallbackEmail, fallbackImage, fallbackName]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  const handlePickImage = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      toast.error("Please choose a JPEG, PNG, WebP, or GIF image");
      return;
    }
    try {
      const square = await cropImageToSquare(file);
      const dataUrl = await toDataUrl(square);
      setImage(dataUrl);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to process image");
    }
  }, []);

  const handleRandomUnsplash = useCallback(async () => {
    setUnsplashLoading(true);
    try {
      const query = buildUnsplashQuery(answer, name || fallbackName);
      const result = await fetchUnsplashRandomPhoto(query);
      setImage(result.url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to fetch Unsplash image");
    } finally {
      setUnsplashLoading(false);
    }
  }, [answer, fallbackName, name]);

  const handleSave = useCallback(async () => {
    const trimmed = toTitleCase(name);
    if (!trimmed) {
      toast.error("Display name cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const updated = await updateMyProfile({ name: trimmed, image });
      onSaved({ name: updated.name, image: updated.image ?? null });
      toast.success("Profile updated");
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save profile");
    } finally {
      setSaving(false);
    }
  }, [image, name, onOpenChange, onSaved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader />

        <div className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="profile-display-name" className="sr-only">
              Display name
            </Label>
            <Input
              id="profile-display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your display name"
              maxLength={120}
              disabled={loading || saving}
              className="h-auto border-0 bg-transparent px-0 text-3xl font-semibold tracking-tight shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>

          <div className="space-y-2">
            <Label>Profile image</Label>
            <div className="flex items-start gap-4">
              <Avatar className="h-20 w-20 rounded-lg border">
                <AvatarImage src={image ?? undefined} alt={name} referrerPolicy="no-referrer" />
                <AvatarFallback className="rounded-lg text-base">{initials}</AvatarFallback>
              </Avatar>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={IMAGE_TYPES.join(",")}
                  className="hidden"
                  onChange={handlePickImage}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={loading || saving}
                  >
                    <ImagePlus className="mr-1 h-4 w-4" />
                    Upload image
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setImage(null)}
                    disabled={!image || loading || saving}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Remove
                  </Button>
                </div>

                <div className="rounded-md border p-3">
                  <Input
                    className="mt-2"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    placeholder="first words that come to mind are ..."
                    disabled={loading || saving || unsplashLoading}
                  />
                  <div className="mt-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRandomUnsplash()}
                      disabled={loading || saving || unsplashLoading}
                    >
                      {unsplashLoading ? (
                        <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-1 h-4 w-4" />
                      )}
                      Generate image
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Creator stats</Label>
              <Button variant="link" size="sm" className="h-auto p-0 text-muted-foreground" asChild>
                <Link to="/profile/$userId" params={{ userId }}>
                  <ExternalLink className="mr-1 h-3.5 w-3.5" />
                  View public profile
                </Link>
              </Button>
            </div>
            {loading && !stats ? (
              <div className="text-sm text-muted-foreground">Loading stats...</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold">{stats?.packsCreated ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Packs created</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold">{stats?.publicPacks ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Public packs</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold">{stats?.samplesCreated ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Samples created</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold">{stats?.publicSamples ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Public samples</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold">{stats?.downloadedPacksByOthers ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Your packs downloaded by others</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-2xl font-semibold">{stats?.downloadedSamplesByOthers ?? 0}</div>
                  <div className="text-xs text-muted-foreground">Your samples downloaded by others</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSave()} disabled={saving || loading}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Save profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
