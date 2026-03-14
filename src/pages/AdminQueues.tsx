import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  Loader2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  Play,
  Square,
  Trash2,
  XCircle,
} from "lucide-react";
import WaveSurfer from "wavesurfer.js";
import { getOrFetchRemoteSample } from "@/lib/audition-cache";
import { ensureAudioDecodable } from "@/lib/audioConverter";
import { SampleSourceBadge } from "@/components/SampleSourceBadge";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSession, isAdminOrSuperadmin } from "@/lib/auth-client";
import {
  getAdminQueues,
  getAdminQueueJobs,
  getAdminQueueJobDetail,
  retryAdminQueueJob,
  clearAdminQueue,
  type QueueInfo,
  type WorkerStatus,
  type JobWithMetadata,
  type JobDetailResponse,
} from "@/lib/admin-queues";

const POLL_INTERVAL_MS = 5000;
const JOB_STATES = ["created", "retry", "active", "completed", "failed"] as const;

function filenameFromS3Key(s3Key: string): string {
  const parts = s3Key.split("/");
  return parts[parts.length - 1] ?? s3Key;
}

const REMOTE_PREFIX = "remote://sample/";

function JobDetailAudioPlayer({ sampleId, filename }: { sampleId: string; filename: string }) {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const path = `${REMOTE_PREFIX}${sampleId}`;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const { objectUrl } = await getOrFetchRemoteSample(sampleId, filename);
        if (cancelled) return;

        const decodableUrl = await ensureAudioDecodable(objectUrl, path);
        if (cancelled || !waveformRef.current) return;

        const ws = WaveSurfer.create({
          container: waveformRef.current,
          waveColor: "#94a3b8",
          progressColor: "#64748b",
          cursorColor: "#64748b",
          barWidth: 2,
          barRadius: 2,
          barGap: 1,
          height: 56,
          backend: "MediaElement",
          mediaControls: false,
          interact: true,
        });

        wavesurferRef.current = ws;

        ws.on("ready", () => {
          if (cancelled) return;
          const width = waveformRef.current?.clientWidth ?? 300;
          const dur = ws.getDuration();
          if (dur > 0) ws.zoom(Math.max(1, width / dur));
          setIsLoading(false);
        });

        ws.on("play", () => {
          if (!cancelled) setIsPlaying(true);
        });
        ws.on("pause", () => {
          if (!cancelled) setIsPlaying(false);
        });
        ws.on("finish", () => {
          if (!cancelled) setIsPlaying(false);
        });

        ws.on("error", (err) => {
          if (cancelled) return;
          setError(err.message || "Failed to load");
          setIsLoading(false);
        });

        await ws.load(decodableUrl);
      } catch (err) {
        if (!cancelled) {
          setError(String(err));
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
      if (wavesurferRef.current) {
        try {
          wavesurferRef.current.pause();
          wavesurferRef.current.destroy();
        } catch {
          /* ignore */
        }
        wavesurferRef.current = null;
      }
    };
  }, [sampleId, filename, path]);

  const handlePlayPause = useCallback(() => {
    const ws = wavesurferRef.current;
    if (!ws) return;
    if (isPlaying) {
      ws.pause();
    } else {
      ws.play();
    }
  }, [isPlaying]);

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Button
          variant="outline"
          size="icon"
          onClick={handlePlayPause}
          disabled={isLoading || !!error}
          aria-label={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Square className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4" />
          )}
        </Button>
        <span className="text-xs text-muted-foreground truncate flex-1">{filename}</span>
      </div>
      <div
        ref={waveformRef}
        className="h-14 min-h-[56px] rounded bg-background/50"
      />
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      {isLoading && !error && (
        <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          Loading waveform…
        </div>
      )}
    </div>
  );
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
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => e.key === "Enter" && onSelect()}
      className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
    >
      {stateIcon}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          {data?.sampleId ? (
            <SampleSourceBadge
              source={{ type: "remote", sampleId: data.sampleId }}
              filename={filename}
              size="md"
              showFilename={true}
              useLink={false}
              className="min-w-0"
            />
          ) : (
            <span className="truncate font-medium">{filename}</span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {data?.sampleId ? (
            <>
              {job.state} · retry {job.retryCount}/{job.retryLimit}
            </>
          ) : (
            <>
              {job.id} · {job.state} · retry {job.retryCount}/{job.retryLimit}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const ESSENTIA_GOAL = `Decode audio from S3, extract Essentia features (BPM, loudness, energy, pitch, spectral centroid, zero-crossing rate), infer instrument family/type from metrics, store attributes and annotations. On success, enqueue clap-analysis.`;

const CLAP_GOAL = `Load audio from S3, run CLAP model to produce a 512-dim embedding, run zero-shot classification for style/descriptor/mood taxonomy categories, store embedding and annotations. On success, set analysisStatus READY.`;

function JobDetailPanel({
  queueName,
  jobId,
  onClose,
  onRetrySuccess,
}: {
  queueName: string;
  jobId: string;
  onClose: () => void;
  onRetrySuccess: () => void;
}) {
  const [data, setData] = useState<JobDetailResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    setLoading(true);
    getAdminQueueJobDetail(queueName, jobId)
      .then(setData)
      .catch((err) => {
        toast.error("Failed to load job", {
          description: err instanceof Error ? err.message : "Unknown error",
        });
      })
      .finally(() => setLoading(false));
  }, [queueName, jobId]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryAdminQueueJob(queueName, jobId);
      toast.success("Job retry requested");
      onRetrySuccess();
    } catch (err) {
      toast.error("Failed to retry", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 border-l bg-muted/30 overflow-hidden">
      <div className="flex items-center justify-between shrink-0 px-4 py-3 border-b">
        <h3 className="font-medium text-sm">Job detail</h3>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close panel">
          <XCircle className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : data ? (
          <>
            {data.job.data && typeof data.job.data === "object" && "sampleId" in data.job.data && "s3Key" in data.job.data && (
              <JobDetailAudioPlayer
                sampleId={(data.job.data as { sampleId: string }).sampleId}
                filename={filenameFromS3Key((data.job.data as { s3Key: string }).s3Key)}
              />
            )}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                Job arguments (input)
              </h4>
              <pre className="mt-1 rounded bg-muted p-3 text-xs overflow-x-auto">
                {JSON.stringify(data.job.data, null, 2)}
              </pre>
              {data.job.data && typeof data.job.data === "object" && "s3Key" in data.job.data && (
                <p className="mt-1 text-xs text-muted-foreground">
                  File: {filenameFromS3Key((data.job.data as { s3Key: string }).s3Key)}
                </p>
              )}
            </div>
            {(queueName === "essentia-analysis" || queueName === "clap-analysis") && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Job goal
                </h4>
                <p className="text-sm">{queueName === "essentia-analysis" ? ESSENTIA_GOAL : CLAP_GOAL}</p>
              </div>
            )}
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                State &amp; timestamps
              </h4>
              <p className="text-sm">
                {data.job.state} · attempt {data.job.retryCount + 1}/{data.job.retryLimit + 1}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                created: {data.job.createdOn}
                {data.job.startedOn && ` · started: ${data.job.startedOn}`}
                {data.job.completedOn && ` · completed: ${data.job.completedOn}`}
              </p>
            </div>
            {data.sample && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Sample status
                </h4>
                <p className="text-sm">
                  analysisStatus: {data.sample.analysisStatus}
                  {"durationMs" in data.sample && data.sample.durationMs != null && ` · ${data.sample.durationMs}ms`}
                  {"sampleRate" in data.sample && data.sample.sampleRate != null && ` · ${data.sample.sampleRate}Hz`}
                  {"channels" in data.sample && data.sample.channels != null && ` · ${data.sample.channels}ch`}
                </p>
                {data.sample.analysisError && (
                  <p className="mt-1 text-xs text-destructive">{data.sample.analysisError}</p>
                )}
              </div>
            )}
            {data.analysisResults && (
              <>
                {data.analysisResults.attributes.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Essentia attributes (results)
                    </h4>
                    <p className="text-xs text-muted-foreground mb-1">
                      Extracted features: BPM, loudness, energy, pitch, spectral centroid, etc.
                    </p>
                    <div className="rounded bg-muted p-2 space-y-1">
                      {data.analysisResults.attributes.map((a) => (
                        <div key={a.key} className="flex justify-between gap-4 text-xs font-mono">
                          <span>{a.key}</span>
                          <span>{typeof a.value === "number" ? a.value.toFixed(4) : String(a.value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.analysisResults.annotations.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                      Taxonomy annotations (results)
                    </h4>
                    <p className="text-xs text-muted-foreground mb-1">
                      Instrument family/type (essentia) or style/descriptor/mood (clap)
                    </p>
                    <div className="rounded bg-muted p-2 space-y-1">
                      {data.analysisResults.annotations.map((a, i) => (
                        <div key={`${a.taxonomyValueId}-${i}`} className="flex justify-between gap-4 text-xs">
                          <span>
                            {a.attributeKey}: {a.valueKey}
                          </span>
                          <span className="text-muted-foreground">
                            {a.source} · {(a.confidence * 100).toFixed(1)}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {data.analysisResults.embeddings.length > 0 &&
                  data.analysisResults.embeddings.map((emb) => (
                    <div key={emb.model}>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                        {emb.model} embedding (results)
                      </h4>
                      <p className="text-xs text-muted-foreground mb-1">
                        {emb.dimensions} dimensions · model {emb.modelVersion}
                      </p>
                      <div className="rounded bg-muted p-2">
                        <p className="text-xs font-mono text-muted-foreground mb-1">
                          [{emb.vector.slice(0, 8).map((v) => v.toFixed(4)).join(", ")}
                          {emb.vector.length > 8 ? ", …" : ""}]
                        </p>
                        <details className="mt-1">
                          <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground">
                            Show all {emb.dimensions} dimensions
                          </summary>
                          <pre className="mt-2 text-[10px] font-mono overflow-x-auto max-h-48 overflow-y-auto">
                            {JSON.stringify(
                              emb.vector.map((v) => Number(v.toFixed(6))),
                              null,
                              0,
                            ).replace(/^\[|\]$/g, "")}
                          </pre>
                        </details>
                      </div>
                    </div>
                  ))}
              </>
            )}
            {data.job.error && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-destructive mb-1">Error</h4>
                <pre className="rounded bg-destructive/10 p-3 text-xs overflow-x-auto text-destructive">
                  {data.job.error}
                </pre>
              </div>
            )}
            {data.job.state === "failed" && (
              <Button onClick={handleRetry} disabled={retrying} size="sm">
                {retrying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Retry job
              </Button>
            )}
          </>
        ) : null}
        </div>
      </ScrollArea>
    </div>
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
  const [clearQueueOpen, setClearQueueOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

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

  const handleClearQueue = async () => {
    if (!selectedQueue) return;
    setClearing(true);
    try {
      await clearAdminQueue(selectedQueue);
      toast.success(`Queue "${selectedQueue}" cleared`);
      setClearQueueOpen(false);
      void loadQueues(false);
      void loadJobs();
    } catch (err) {
      toast.error("Failed to clear queue", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setClearing(false);
    }
  };

  if (isPending || !isAdminOrSuperadmin(session)) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="w-full max-w-[1920px] mx-auto py-8 px-4 lg:px-6">
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

        <div className="grid grid-cols-1 lg:grid-cols-6 gap-6 w-full">
          <div className="space-y-4 lg:col-span-1">
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
                    <button
                      type="button"
                      className="inline-flex"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedQueue(q.name);
                        setSelectedState("created");
                      }}
                    >
                      <Badge variant="secondary" className="cursor-pointer hover:opacity-90 transition-opacity">
                        queued: {q.queuedCount}
                      </Badge>
                    </button>
                    <button
                      type="button"
                      className="inline-flex"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedQueue(q.name);
                        setSelectedState("active");
                      }}
                    >
                      <Badge variant="default" className="cursor-pointer hover:opacity-90 transition-opacity">
                        active: {q.activeCount}
                      </Badge>
                    </button>
                    <button
                      type="button"
                      className="inline-flex"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedQueue(q.name);
                        setSelectedState("completed");
                      }}
                    >
                      <Badge variant="outline" className="cursor-pointer hover:opacity-90 transition-opacity">
                        completed: {q.completedCount}
                      </Badge>
                    </button>
                    <button
                      type="button"
                      className="inline-flex"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedQueue(q.name);
                        setSelectedState("failed");
                      }}
                    >
                      <Badge variant="destructive" className="cursor-pointer hover:opacity-90 transition-opacity">
                        failed: {q.failedCount}
                      </Badge>
                    </button>
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

          <div className="lg:col-span-2 min-w-0">
            {selectedQueue ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <Tabs value={selectedState} onValueChange={(v) => setSelectedState(v as (typeof JOB_STATES)[number])}>
                    <TabsList className="mb-4">
                      {JOB_STATES.map((s) => (
                        <TabsTrigger key={s} value={s}>
                          {s}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                  <AlertDialog open={clearQueueOpen} onOpenChange={setClearQueueOpen}>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setClearQueueOpen(true)}
                      disabled={clearing}
                    >
                      {clearing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                      Clear queue
                    </Button>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Clear queue &quot;{selectedQueue}&quot;?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will delete all jobs in this queue (queued, active, completed, failed). Use this when jobs
                          are stuck due to a bug. This cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={clearing}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={(e) => {
                            e.preventDefault();
                            void handleClearQueue();
                          }}
                          disabled={clearing}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Clear queue"}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
                <Tabs value={selectedState} onValueChange={(v) => setSelectedState(v as (typeof JOB_STATES)[number])}>
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
              </div>
            ) : (
              <p className="text-muted-foreground py-12">Select a queue to view jobs.</p>
            )}
          </div>

          <div className="lg:col-span-3 min-w-0 min-h-[400px] flex flex-col overflow-hidden">
            {selectedQueue && detailJobId ? (
              <JobDetailPanel
                queueName={selectedQueue}
                jobId={detailJobId}
                onClose={() => setDetailJobId(null)}
                onRetrySuccess={() => {
                  setDetailJobId(null);
                  void loadJobs();
                  void loadQueues(true);
                }}
              />
            ) : (
              <div className="hidden lg:flex h-full rounded-lg border border-dashed bg-muted/20 items-center justify-center p-6">
                <p className="text-sm text-muted-foreground text-center">
                  Select a job from the list to view details
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
