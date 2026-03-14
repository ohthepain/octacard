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

export interface JobDetailSample {
  analysisStatus: string;
  analysisError: string | null;
  durationMs: number | null;
  sampleRate: number | null;
  channels: number | null;
}

export interface JobDetailAnalysisResults {
  attributes: Array<{ key: string; value: number }>;
  annotations: Array<{
    taxonomyValueId: string;
    attributeKey: string;
    valueKey: string;
    confidence: number;
    source: string;
    rank: number | null;
  }>;
  embeddings: Array<{
    model: string;
    modelVersion: string;
    dimensions: number;
    vector: number[];
  }>;
}

export interface JobDetailResponse {
  job: JobWithMetadata;
  sample: JobDetailSample | null;
  analysisResults: JobDetailAnalysisResults | null;
}

export async function getAdminQueueJobDetail(
  queueName: string,
  jobId: string,
): Promise<JobDetailResponse> {
  const res = await apiFetch(`/api/admin/queues/${queueName}/jobs/${jobId}`);
  if (!res.ok) throw new Error(`Failed to load job (${res.status})`);
  return res.json() as Promise<JobDetailResponse>;
}

export async function retryAdminQueueJob(queueName: string, jobId: string): Promise<void> {
  const res = await apiFetch(`/api/admin/queues/${queueName}/jobs/${jobId}/retry`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to retry job (${res.status})`);
}

export async function clearAdminQueue(queueName: string): Promise<void> {
  const res = await apiFetch(`/api/admin/queues/${queueName}/clear`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Failed to clear queue (${res.status})`);
}
