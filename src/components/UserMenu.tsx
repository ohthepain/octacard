import { User, LogIn, LogOut, Scale, ToggleLeft, Shield } from "lucide-react";
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

export function UserMenu() {
  const { data: session, isPending } = useSession();
  const devMode = useAppOptionsStore((s) => s.devMode);
  const setDevMode = useAppOptionsStore((s) => s.setDevMode);

  if (isPending) {
    return (
      <Button variant="ghost" size="icon" className="rounded-full" disabled>
        <User className="h-5 w-5" />
      </Button>
    );
  }

  const user = session?.user;
  const initials = user?.name
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full" aria-label="User menu" data-testid="user-menu">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.image ?? undefined} alt={user?.name ?? ""} />
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {user ? (
          <>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-1">
                <span className="font-medium">{user.name ?? user.email}</span>
                {devMode && (
                  <span className="text-xs font-mono text-muted-foreground truncate" title={user.id}>
                    {user.id}
                  </span>
                )}
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
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
    </DropdownMenu>
  );
}
