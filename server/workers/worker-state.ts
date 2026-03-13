/**
 * In-memory worker status for admin debugging.
 */

export type WorkerStatus = {
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
};

const statuses = new Map<string, WorkerStatus>();

function getOrCreate(queue: string): WorkerStatus {
  let s = statuses.get(queue);
  if (!s) {
    s = {
      queue,
      enabled: false,
      startAttemptedAt: null,
      startedAt: null,
      readyAt: null,
      lastJobStartedAt: null,
      lastJobCompletedAt: null,
      lastJobSampleId: null,
      lastErrorAt: null,
      lastError: null,
    };
    statuses.set(queue, s);
  }
  return s;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function setWorkerEnabled(queue: string, enabled: boolean): void {
  getOrCreate(queue).enabled = enabled;
}

export function markWorkerStartAttempt(queue: string): void {
  const s = getOrCreate(queue);
  s.startAttemptedAt = nowIso();
  s.lastError = null;
  s.lastErrorAt = null;
}

export function markWorkerStarted(queue: string): void {
  getOrCreate(queue).startedAt = nowIso();
}

export function markWorkerReady(queue: string): void {
  getOrCreate(queue).readyAt = nowIso();
}

export function markWorkerJobStarted(queue: string, sampleId: string | null): void {
  const s = getOrCreate(queue);
  s.lastJobStartedAt = nowIso();
  s.lastJobSampleId = sampleId;
}

export function markWorkerJobCompleted(queue: string, sampleId: string | null): void {
  const s = getOrCreate(queue);
  s.lastJobCompletedAt = nowIso();
  s.lastJobSampleId = sampleId;
}

export function markWorkerError(queue: string, error: unknown): void {
  const s = getOrCreate(queue);
  s.lastErrorAt = nowIso();
  s.lastError = error instanceof Error ? error.message : String(error);
}

export function getWorkerStatus(queue: string): WorkerStatus {
  return { ...getOrCreate(queue) };
}

export function getAllWorkerStatuses(): WorkerStatus[] {
  return Array.from(statuses.values()).map((s) => ({ ...s }));
}
