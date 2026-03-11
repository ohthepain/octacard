import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Activity, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSession, isAdminOrSuperadmin } from "@/lib/auth-client";
import { clearAdminNetworkTraces, getAdminNetworkTraces, type AdminNetworkTrace } from "@/lib/admin-network";

const POLL_INTERVAL_MS = 3000;
const TRACE_LIMIT = 200;

function formatTime(value: string): string {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function AdminNetwork() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const [traces, setTraces] = useState<AdminNetworkTrace[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(false);
  const [errorsOnly, setErrorsOnly] = useState(false);

  useEffect(() => {
    if (isPending) return;
    if (!isAdminOrSuperadmin(session)) {
      navigate({ to: "/" });
    }
  }, [session, isPending, navigate]);

  const loadTraces = useCallback(
    async (isBackground = false) => {
      if (!isBackground) setLoading(true);
      try {
        const data = await getAdminNetworkTraces({ limit: TRACE_LIMIT, errorsOnly });
        setTraces(data);
      } catch (error) {
        if (!isBackground) {
          toast.error("Failed to load network traces", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        }
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [errorsOnly],
  );

  useEffect(() => {
    if (isPending || !isAdminOrSuperadmin(session)) return;
    void loadTraces(false);
  }, [session, isPending, loadTraces]);

  useEffect(() => {
    if (paused || isPending || !isAdminOrSuperadmin(session)) return;
    const timer = window.setInterval(() => {
      void loadTraces(true);
    }, POLL_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [paused, session, isPending, loadTraces]);

  const failedCount = useMemo(() => traces.filter((trace) => !trace.ok).length, [traces]);

  if (isPending || !isAdminOrSuperadmin(session)) return null;

  const handleClear = async () => {
    setBusy(true);
    try {
      await clearAdminNetworkTraces();
      setTraces([]);
      toast.success("Network traces cleared");
    } catch (error) {
      toast.error("Failed to clear traces", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl py-12 px-4 space-y-6">
        <div>
          <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to admin
          </Link>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-muted-foreground" />
            <h1 className="text-2xl font-semibold">Network Monitor</h1>
          </div>
          <p className="text-muted-foreground">
            Recent outbound traffic from server to external APIs (Unsplash, S3).
          </p>
        </div>

        <div className="rounded-lg border bg-card p-4 flex flex-wrap items-center gap-3">
          <Badge variant="outline">{traces.length} visible</Badge>
          <Badge variant={failedCount > 0 ? "destructive" : "secondary"}>{failedCount} failures</Badge>
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={paused} onCheckedChange={setPaused} />
            Pause auto-refresh
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Switch checked={errorsOnly} onCheckedChange={setErrorsOnly} />
            Errors only
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="outline" onClick={() => void loadTraces(false)} disabled={loading || busy}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button variant="outline" onClick={handleClear} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Clear
            </Button>
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Service</TableHead>
                <TableHead>Operation</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    Loading traces...
                  </TableCell>
                </TableRow>
              ) : traces.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
                    No traces captured yet.
                  </TableCell>
                </TableRow>
              ) : (
                traces.map((trace) => (
                  <TableRow key={trace.id}>
                    <TableCell>{formatTime(trace.timestamp)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{trace.service}</Badge>
                    </TableCell>
                    <TableCell>{trace.operation}</TableCell>
                    <TableCell>{trace.method ?? "-"}</TableCell>
                    <TableCell>
                      <Badge variant={trace.ok ? "secondary" : "destructive"}>
                        {trace.statusCode ?? (trace.ok ? "OK" : "ERR")}
                      </Badge>
                    </TableCell>
                    <TableCell>{trace.durationMs} ms</TableCell>
                    <TableCell className="max-w-[340px] truncate" title={trace.target ?? "-"}>
                      {trace.target ?? "-"}
                    </TableCell>
                    <TableCell className="max-w-[340px] truncate" title={trace.error ?? "-"}>
                      {trace.error ?? "-"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
