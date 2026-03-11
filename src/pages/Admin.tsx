import { Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { LayoutDashboard, ExternalLink, Tags } from "lucide-react";
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
      <div className="container max-w-2xl py-12 px-4">
        <div className="mb-8">
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to app
          </Link>
        </div>
        <h1 className="text-2xl font-semibold mb-2">Admin</h1>
        <p className="text-muted-foreground mb-8">
          Tools for administrators. Available only to admin and superadmin users.
        </p>
        <div className="flex flex-col gap-4">
          {ADMIN_TOOLS.map((tool) => {
            const Icon = tool.icon;
            const content = (
              <div className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors">
                <div className="p-2 rounded-md bg-muted">
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium flex items-center gap-2">
                    {tool.label}
                    {tool.external && (
                      <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0" />
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{tool.description}</p>
                </div>
              </div>
            );
            return tool.external ? (
              <a key={tool.id} href={tool.href} target="_blank" rel="noopener noreferrer">
                <Button variant="ghost" className="w-full justify-start h-auto p-0">
                  {content}
                </Button>
              </a>
            ) : (
              <Link key={tool.id} to={tool.href}>
                <Button variant="ghost" className="w-full justify-start h-auto p-0">
                  {content}
                </Button>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
