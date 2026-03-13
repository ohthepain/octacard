import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, LayoutDashboard, ExternalLink, Tags } from "lucide-react";
import { useSession } from "@/lib/auth-client";
import { isAdminOrSuperadmin } from "@/lib/auth-client";
import { useEffect } from "react";

type AdminTool =
  | {
      id: string;
      label: string;
      description: string;
      href: string;
      external: true;
      icon: typeof LayoutDashboard;
    }
  | {
      id: string;
      label: string;
      description: string;
      href: "/admin/taxonomy";
      external: false;
      icon: typeof LayoutDashboard;
    }
  | {
      id: string;
      label: string;
      description: string;
      href: "/admin/network";
      external: false;
      icon: typeof LayoutDashboard;
    };

const ADMIN_TOOLS: readonly AdminTool[] = [
  {
    id: "bull-board",
    label: "Queue Dashboard",
    description: "BullMQ job queues (sample analysis)",
    href: "/api/admin/queues",
    external: true,
    icon: LayoutDashboard,
  },
  {
    id: "network-monitor",
    label: "Network Monitor",
    description: "Outbound requests from API server to external services",
    href: "/admin/network",
    external: false,
    icon: Activity,
  },
  {
    id: "taxonomy-editor",
    label: "Taxonomy Editor",
    description: "Add/remove instrument families and instrument types",
    href: "/admin/taxonomy",
    external: false,
    icon: Tags,
  },
];

export default function Admin() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  useEffect(() => {
    if (isPending) return;
    if (!isAdminOrSuperadmin(session)) {
      navigate({ to: "/" });
    }
  }, [session, isPending, navigate]);

  if (isPending || !isAdminOrSuperadmin(session)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-3xl py-12 px-4">
        <div className="mb-8">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to app
          </Link>
        </div>
        <h1 className="text-2xl font-semibold mb-2">Admin</h1>
        <p className="text-muted-foreground mb-8">
          Tools for administrators. Available only to admin and superadmin users.
        </p>
        <div className="mx-auto grid max-w-[536px] grid-cols-1 gap-4 sm:grid-cols-2">
          {ADMIN_TOOLS.map((tool) => {
            const Icon = tool.icon;
            const content = (
              <>
                <div className="rounded-md bg-muted p-2">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 font-medium">
                    {tool.label}
                    {tool.external && <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">{tool.description}</p>
                </div>
              </>
            );

            const tileClassName =
              "flex h-full min-h-[108px] w-full items-start gap-4 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

            return tool.external ? (
              <a key={tool.id} href={tool.href} target="_blank" rel="noopener noreferrer" className={tileClassName}>
                {content}
              </a>
            ) : (
              <Link key={tool.id} to={tool.href} className={tileClassName}>
                {content}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
