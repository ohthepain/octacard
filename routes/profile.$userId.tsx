import { createRoute } from "@tanstack/react-router";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, FolderOpen, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { getPublicProfile } from "@/lib/remote-library";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { rootRoute } from "./__root";

export const profileUserIdRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/profile/$userId",
  component: PublicProfilePage,
});

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

function PublicProfilePage() {
  const { userId } = useParams({ from: "/profile/$userId" });
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof getPublicProfile>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPublicProfile(userId)
      .then((data) => {
        if (!cancelled) setProfile(data);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load profile");
          toast.error("Failed to load profile");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Loading profile...</p>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6">
        <p className="text-destructive">{error ?? "Profile not found"}</p>
        <Button variant="outline" asChild>
          <Link to="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to app
          </Link>
        </Button>
      </div>
    );
  }

  const initials = toInitials(profile.name);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-2xl items-center justify-between">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
        </div>
      </header>

      <main className="flex-1 p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
            <Avatar className="h-24 w-24 rounded-xl border-2 border-border">
              <AvatarImage src={profile.image ?? undefined} alt={profile.name} referrerPolicy="no-referrer" />
              <AvatarFallback className="rounded-xl text-2xl">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight">{profile.name}</h1>
              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <FolderOpen className="h-4 w-4" />
                  {profile.publicPacks} public pack{profile.publicPacks !== 1 ? "s" : ""}
                </span>
                <span>{profile.publicSamples} samples</span>
                <span>{profile.favoritedPacks} favorited by others</span>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <Button asChild className="w-full sm:w-auto">
              <Link to="/" search={{ creator: userId }}>
                <FolderOpen className="mr-2 h-4 w-4" />
                View packs
              </Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
