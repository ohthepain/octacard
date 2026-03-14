# Admin

Main admin panel at `/admin` routes to sub-panels. Admin and superadmin roles only.

## Taxonomy Editor

Manage sound metadata: instrument families and types. Add, remove, reorder.

## Network Monitor

Monitor outbound requests from the API server to external services (S3, SES, etc.). Filter by errors, clear traces.

## Queue Dashboard

Custom admin panel for pg-boss job queues (replaces BullBoard).

### Layout

- **Left column**: Queue list (`essentia-analysis`, `clap-analysis`) with badge counts (queued, active, completed, failed)
- **Main panel**: Tabs for job states (created, retry, active, completed, failed)
- **Job cards**: Per-queue components showing filename (from s3Key), sampleId, state, retry count
- **Job detail**: Modal with full payload, timestamps, error stack, sample `analysisStatus`, retry button

### Debugging Info

| Data | Source | Purpose |
|------|--------|---------|
| Job ID, name, queue | pg-boss | Correlation |
| Payload (sampleId, s3Key) | pg-boss | Reproduce |
| State, created/started/completed | pg-boss | Timing |
| Attempt count, max attempts | pg-boss | Retry behavior |
| Error message + stack | pg-boss | Root cause |
| Worker last activity | worker-state | Liveness |
| Sample analysisStatus, analysisError | DB | Consistency check |

### Worker Concurrency

Each API process runs Essentia and CLAP workers. If you see many active jobs (e.g. 6 CLAP, 4 Essentia), multiple processes are likely running workers (e.g. `pnpm run dev` plus `pnpm run worker:essentia` in another terminal).

- **Single process**: Use `pnpm run dev` only. Concurrency: Essentia 1 (dev) / 2 (prod), CLAP 1.
- **Separate workers**: Use `pnpm run dev:no-workers` for the API, then run `pnpm run worker:essentia` and `pnpm run worker:clap` in separate terminals. Override with `ESSENTIA_WORKER_CONCURRENCY=1` and `CLAP_WORKER_CONCURRENCY=1` if needed.
