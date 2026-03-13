import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Loader2,
  RefreshCw,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSession, isAdminOrSuperadmin } from "@/lib/auth-client";
import {
  getAdminQueues,
  getAdminQueueJobs,
  getAdminQueueJobDetail,
  retryAdminQueueJob,
  type QueueInfo,
  type WorkerStatus,
  type JobWithMetadata,
} from "@/lib/admin-queues";

const POLL_INTERVAL_MS = 5000;
const JOB_STATES = ["created", "retry", "active", "completed", "failed"] as const;

function filenameFromS3Key(s3Key: string): string {
  const parts = s3Key.split("/");
  return parts[parts.length - 1] ?? s3Key;
}

function JobCard({
  job,
  onSelect,
}: {
  job: JobWithMetadata;
  onSelect: () => void;
}) {
  const data = job.data as { sampleId?: string; s3Key?: string };
  const filename = data?.s3Key ? filenameFromS3Key(data.s3Key) : "-";
  const stateIcon =
    job.state === "completed" ? (
      <CheckCircle2 className="h-4 w-4 text-green-600" />
    ) : job.state === "failed" ? (
      <XCircle className="h-4 w-4 text-destructive" />
    ) : job.state === "active" ? (
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
    ) : (
      <Clock className="h-4 w-4 text-muted-foreground" />
    );

  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
    >
      {stateIcon}
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{filename}</div>
        <div className="text-xs text-muted-foreground">
          {data?.sampleId ?? job.id} · {job.state} · retry {job.retryCount}/{job.retryLimit}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
    </button>
  );
}

function JobDetailDialog({
  queueName,
  jobId,
  open,
  onOpenChange,
}: {
  queueName: string;
  jobId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [data, setData] = useState<{
    job: JobWithMetadata;
    sample: { analysisStatus: string; analysisError: string | null } | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!open || !jobId) return;
    setLoading(true);
    getAdminQueueJobDetail(queueName, jobId)
      .then(setData)
      .catch((err) => {
        toast.error("Failed to load job", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      })
      .finally(() => setLoading(false));
  }, [open, queueName, jobId]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryAdminQueueJob(queueName, jobId);
      toast.success("Job retry requested");
      onOpenChange(false);
    } catch (err) {
      toast.error("Failed to retry", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Job {jobId}</DialogTitle>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Payload</h4>
                <pre className="mt-1 rounded bg-muted p-3 text-xs overflow-x-auto">
                  {JSON.stringify(data.job.data, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">State</h4>
                <p className="mt-1 text-sm">
                  {data.job.state} · attempt {data.job.retryCount + 1}/{data.job.retryLimit + 1}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-medium text-muted-foreground">Timestamps</h4>
                <p className="mt-1 text-sm">
                  created: {data.job.createdOn}
                  {data.job.startedOn && ` · started: ${data.job.startedOn}`}
                  {data.job.completedOn && ` · completed: ${data.job.completedOn}`}
                </p>
              </div>
              {data.job.error && (
                <div>
                  <h4 className="text-sm font-medium text-destructive">Error</h4>
                  <pre className="mt-1 rounded bg-destructive/10 p-3 text-xs overflow-x-auto text-destructive">
                    {data.job.error}
                  </pre>
                </div>
              )}
              {data.sample && (
                <div>
                  <h4 className="text-sm font-medium text-muted-foreground">Sample status</h4>
                  <p className="mt-1 text-sm">
                    analysisStatus: {data.sample.analysisStatus}
                    {data.sample.analysisError && ` · error: ${data.sample.analysisError}`}
                  </p>
                </div>
              )}
              {data.job.state === "failed" && (
                <Button onClick={handleRetry} disabled={retrying}>
                  {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  Retry job
                </Button>
              )}
            </div>
          </ScrollArea>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function AdminQueues() {
  const { data: session, isPending } = useSession();
  const navigate = useNavigate();

  const [queues, setQueues] = useState<QueueInfo[]>([]);
  const [workers, setWorkers] = useState<WorkerStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
  const [selectedState, setSelectedState] = useState<(typeof JOB_STATES)[number]>("active");
  const [jobs, setJobs] = useState<JobWithMetadata[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);

  const loadQueues = useCallback(async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    try {
      const data = await getAdminQueues();
      setQueues(data.queues);
      setWorkers(data.workers);
    } catch (error) {
      if (!isBackground) {
        toast.error("Failed to load queues", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    } finally {
      if (!isBackground) setLoading(false);
    }
  }, []);

  const loadJobs = useCallback(async () => {
    if (!selectedQueue) return;
    setJobsLoading(true);
    try {
      const { jobs: j } = await getAdminQueueJobs(selectedQueue, {
        state: selectedState,
        limit: 50,
      });
      setJobs(j);
    } catch (error) {
      toast.error("Failed to load jobs", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setJobsLoading(false);
    }
  }, [selectedQueue, selectedState]);

  useEffect(() => {
    if (isPending) return;
    if (!isAdminOrSuperadmin(session)) {
      navigate({ to: "/" });
    }
  }, [session, isPending, navigate]);

  useEffect(() => {
    if (isPending || !isAdminOrSuperadmin(session)) return;
    void loadQueues(false);
  }, [session, isPending, loadQueues]);

  useEffect(() => {
    if (paused || isPending || !isAdminOrSuperadmin(session)) return;
    const timer = window.setInterval(() => void loadQueues(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [paused, session, isPending, loadQueues]);

  useEffect(() => {
    if (selectedQueue) void loadJobs();
  }, [selectedQueue, selectedState, loadJobs]);

  if (isPending || !isAdminOrSuperadmin(session)) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-6xl py-8 px-4">
        <div className="mb-6">
          <Link to="/admin" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to admin
          </Link>
        </div>
        <h1 className="text-2xl font-semibold mb-2">Queue Dashboard</h1>
        <p className="text-muted-foreground mb-6">
          pg-boss job queues (Essentia and CLAP sample analysis). Debugging info for each job.
        </p>

        <div className="flex items-center gap-4 mb-6">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadQueues(false)}
            disabled={loading}
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
          <Button
            variant={paused ? "default" : "outline"}
            size="sm"
            onClick={() => setPaused(!paused)}
          >
            {paused ? "Resume polling" : "Pause polling"}
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4">
            <h2 className="text-sm font-medium text-muted-foreground">Queues</h2>
            {queues.map((q) => (
              <Card
                key={q.name}
                className={`cursor-pointer transition-colors ${
                  selectedQueue === q.name ? "ring-2 ring-primary" : ""
                }`}
              >
                <button
                  type="button"
                  className="w-full text-left"
                  onClick={() => setSelectedQueue(q.name)}
                  onKeyDown={(e) => e.key === "Enter" && setSelectedQueue(q.name)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{q.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex flex-wrap gap-2">
                    <Badge variant="secondary">queued: {q.queuedCount}</Badge>
                    <Badge variant="default">active: {q.activeCount}</Badge>
                    <Badge variant="outline">completed: {q.completedCount}</Badge>
                    <Badge variant="destructive">failed: {q.failedCount}</Badge>
                  </CardContent>
                </button>
              </Card>
            ))}

            <h2 className="text-sm font-medium text-muted-foreground mt-6">Workers</h2>
            {workers.map((w) => (
              <Card key={w.queue}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    {w.queue}
                    {w.lastError && (
                      <span title={w.lastError}>
                        <AlertCircle className="h-4 w-4 text-destructive" />
                      </span>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-muted-foreground space-y-1">
                  <p>ready: {w.readyAt ?? "-"}</p>
                  <p>last job: {w.lastJobSampleId ?? "-"}</p>
                  {w.lastError && <p className="text-destructive">error: {w.lastError}</p>}
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="lg:col-span-2">
            {selectedQueue ? (
              <Tabs value={selectedState} onValueChange={(v) => setSelectedState(v as (typeof JOB_STATES)[number])}>
                  <TabsList className="mb-4">
                    {JOB_STATES.map((s) => (
                      <TabsTrigger key={s} value={s}>
                        {s}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                  <TabsContent value={selectedState} className="mt-0">
                    {jobsLoading ? (
                      <div className="flex justify-center py-12">
                        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {jobs.length === 0 ? (
                          <p className="text-sm text-muted-foreground py-4">No jobs in this state.</p>
                        ) : (
                          jobs.map((job) => (
                            <JobCard
                              key={job.id}
                              job={job}
                              onSelect={() => setDetailJobId(job.id)}
                            />
                          ))
                        )}
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
            ) : (
              <p className="text-muted-foreground py-12">Select a queue to view jobs.</p>
            )}
          </div>
        </div>

        {selectedQueue && detailJobId && (
          <JobDetailDialog
            queueName={selectedQueue}
            jobId={detailJobId}
            open={!!detailJobId}
            onOpenChange={(open) => !open && setDetailJobId(null)}
          />
        )}
      </div>
    </div>
  );
}
