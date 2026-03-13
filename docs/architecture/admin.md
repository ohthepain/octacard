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
