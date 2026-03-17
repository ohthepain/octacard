import { useEffect, useMemo, useState } from "react";
import { LogIn, LogOut, Scale, ToggleLeft, Shield, Database, UserRound, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Link } from "@tanstack/react-router";
import { useSession, signOut, isAdminOrSuperadmin } from "@/lib/auth-client";
import { useAppOptionsStore } from "@/stores/app-options-store";
import { ProfileDialog } from "@/components/ProfileDialog";

export function UserMenu() {
  const { data: session, isPending } = useSession();
  const devMode = useAppOptionsStore((s) => s.devMode);
  const setDevMode = useAppOptionsStore((s) => s.setDevMode);
  const openCacheDebug = useAppOptionsStore((s) => s.openCacheDebug);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [profileNameOverride, setProfileNameOverride] = useState<string | null>(null);
  const [profileImageOverride, setProfileImageOverride] = useState<string | null | undefined>(undefined);

  const user = session?.user;
  const displayName = useMemo(
    () => profileNameOverride ?? user?.name ?? user?.email ?? "User",
    [profileNameOverride, user?.email, user?.name],
  );
  const displayImage = profileImageOverride !== undefined ? profileImageOverride : user?.image ?? null;

  useEffect(() => {
    if (!user) {
      setProfileNameOverride(null);
      setProfileImageOverride(undefined);
    }
  }, [user]);

  const initials = isPending
    ? "…"
    : displayName
      ? displayName
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)
      : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="User menu"
          data-testid="user-menu"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={displayImage ?? undefined} alt={displayName} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 z-[110]">
        {user ? (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{displayName}</span>
                {devMode && (
                  <span className="text-xs font-mono text-muted-foreground truncate" title={user.id}>
                    {user.id}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => setProfileDialogOpen(true)}
              className="flex items-center gap-2 cursor-pointer"
            >
              <UserRound className="h-4 w-4" />
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to="/profile/$userId"
                params={{ userId: user.id }}
                className="flex items-center gap-2 cursor-pointer"
              >
                <Globe className="h-4 w-4" />
                Public Profile
              </Link>
            </DropdownMenuItem>
            {isAdminOrSuperadmin(session) && (
              <DropdownMenuItem asChild>
                <Link to="/admin" className="flex items-center gap-2 cursor-pointer">
                  <Shield className="h-4 w-4" />
                  Admin
                </Link>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem asChild>
              <Link to="/legal" className="flex items-center gap-2 cursor-pointer">
                <Scale className="h-4 w-4" />
                Legal & Privacy
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDevMode(!devMode)}
              className="flex items-center gap-2 cursor-pointer"
              data-testid="dev-mode-button"
            >
              <ToggleLeft className={`h-4 w-4 ${devMode ? "text-orange-500" : ""}`} />
              Dev Mode {devMode ? "On" : "Off"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => openCacheDebug()}
              className="flex items-center gap-2 cursor-pointer text-violet-600 focus:text-violet-600"
              data-testid="cache-debug-button"
            >
              <Database className="h-4 w-4" />
              Cache Debug
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()} className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive">
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuItem asChild>
              <Link to="/legal" className="flex items-center gap-2 cursor-pointer">
                <Scale className="h-4 w-4" />
                Legal & Privacy
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setDevMode(!devMode)}
              className="flex items-center gap-2 cursor-pointer"
              data-testid="dev-mode-button"
            >
              <ToggleLeft className={`h-4 w-4 ${devMode ? "text-orange-500" : ""}`} />
              Dev Mode {devMode ? "On" : "Off"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => openCacheDebug()}
              className="flex items-center gap-2 cursor-pointer text-violet-600 focus:text-violet-600"
              data-testid="cache-debug-button"
            >
              <Database className="h-4 w-4" />
              Cache Debug
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link to="/sign-in" className="flex items-center gap-2 cursor-pointer">
                <LogIn className="h-4 w-4" />
                Sign in
              </Link>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
      {user && (
        <ProfileDialog
          open={profileDialogOpen}
          onOpenChange={setProfileDialogOpen}
          fallbackName={displayName}
          fallbackEmail={user.email}
          fallbackImage={displayImage}
          userId={user.id}
          onSaved={(profile) => {
            setProfileNameOverride(profile.name);
            setProfileImageOverride(profile.image);
          }}
        />
      )}
    </DropdownMenu>
  );
}
