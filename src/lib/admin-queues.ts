import { apiFetch } from "@/lib/api-client";

export interface QueueInfo {
  name: string;
  queuedCount: number;
  activeCount: number;
  completedCount: number;
  failedCount: number;
  deferredCount: number;
}

export interface WorkerStatus {
  queue: string;
  enabled: boolean;
  startAttemptedAt: string | null;
  startedAt: string | null;
  readyAt: string | null;
  lastJobStartedAt: string | null;
  lastJobCompletedAt: string | null;
  lastJobSampleId: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
}

export interface QueuesResponse {
  queues: QueueInfo[];
  workers: WorkerStatus[];
}

export interface JobWithMetadata {
  id: string;
  name: string;
  data: { sampleId?: string; s3Key?: string };
  state: "created" | "retry" | "active" | "completed" | "cancelled" | "failed";
  retryCount: number;
  retryLimit: number;
  createdOn: string;
  startedOn?: string;
  completedOn?: string | null;
  output?: unknown;
  error?: string;
}

export async function getAdminQueues(): Promise<QueuesResponse> {
  const res = await apiFetch("/api/admin/queues");
  if (!res.ok) throw new Error(`Failed to load queues (${res.status})`);
  return res.json() as Promise<QueuesResponse>;
}

export async function getAdminQueueJobs(
  queueName: string,
  options?: { state?: string; limit?: number },
): Promise<{ jobs: JobWithMetadata[] }> {
  const params = new URLSearchParams();
  if (options?.state) params.set("state", options.state);
  if (options?.limit) params.set("limit", String(options.limit));
  const suffix = params.toString() ? `?${params.toString()}` : "";
  const res = await apiFetch(`/api/admin/queues/${queueName}/jobs${suffix}`);
  if (!res.ok) throw new Error(`Failed to load jobs (${res.status})`);
  return res.json() as Promise<{ jobs: JobWithMetadata[] }>;
}

export async function getAdminQueueJobDetail(
  queueName: string,
  jobId: string,
): Promise<{ job: JobWithMetadata; sample: { analysisStatus: string; analysisError: string | null } | null }> {
  const res = await apiFetch(`/api/admin/queues/${queueName}/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Failed to load job (${res.status})`);
  return res.json() as Promise<{ job: JobWithMetadata; sample: { analysisStatus: string; analysisError: string | null } | null }>;
}

export async function retryAdminQueueJob(queueName: string, jobId: string): Promise<void> {
  const res = await apiFetch(`/api/admin/queues/${queueName}/jobs/${jobId}/retry`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to retry job (${res.status})`);
}
