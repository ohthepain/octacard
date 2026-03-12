type SampleAnalysisWorkerStatus = {
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

const status: SampleAnalysisWorkerStatus = {
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

function nowIso(): string {
  return new Date().toISOString();
}

export function setSampleAnalysisWorkerEnabled(enabled: boolean): void {
  status.enabled = enabled;
}

export function markSampleAnalysisWorkerStartAttempt(): void {
  status.startAttemptedAt = nowIso();
  status.lastError = null;
  status.lastErrorAt = null;
}

export function markSampleAnalysisWorkerStarted(): void {
  status.startedAt = nowIso();
}

export function markSampleAnalysisWorkerReady(): void {
  status.readyAt = nowIso();
}

export function markSampleAnalysisWorkerJobStarted(
  sampleId: string | null,
): void {
  status.lastJobStartedAt = nowIso();
  status.lastJobSampleId = sampleId;
}

export function markSampleAnalysisWorkerJobCompleted(
  sampleId: string | null,
): void {
  status.lastJobCompletedAt = nowIso();
  status.lastJobSampleId = sampleId;
}

export function markSampleAnalysisWorkerError(error: unknown): void {
  status.lastErrorAt = nowIso();
  status.lastError = error instanceof Error ? error.message : String(error);
}

export function getSampleAnalysisWorkerStatus(): SampleAnalysisWorkerStatus {
  return { ...status };
}
