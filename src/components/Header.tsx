import { Bug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/lib/auth-client";
import { isAdminOrSuperadmin } from "@/lib/auth-client";
import { useAppOptionsStore } from "@/stores/app-options-store";

/** Dev mode toggle - solid when on, outline when off. Visible only for admin/superadmin. */
export function DevModeToggle() {
  const { data: session } = useSession();
  const devMode = useAppOptionsStore((s) => s.devMode);
  const setDevMode = useAppOptionsStore((s) => s.setDevMode);

  if (!isAdminOrSuperadmin(session)) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant={devMode ? "default" : "outline"}
          size="sm"
          className={
            devMode
              ? "text-orange-500 hover:text-orange-600"
              : "text-muted-foreground hover:text-foreground"
          }
          aria-label="Toggle dev mode"
          aria-pressed={devMode}
          data-testid="dev-mode-toggle"
          onClick={() => setDevMode(!devMode)}
        >
          <Bug className={`h-4 w-4 ${devMode ? "fill-current" : ""}`} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Dev mode {devMode ? "on" : "off"}</TooltipContent>
    </Tooltip>
  );
}
