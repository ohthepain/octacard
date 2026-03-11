# Octacard Agent Notes

## Request Manager Rule
- Route **all client -> server** requests through `src/lib/api-client.ts` (`apiFetch`).
- Route **all server -> external service** calls through `server/external-api-trace.ts` (`tracedFetch` for HTTP, `traceAwsCall` for SDK calls).
- Do **not** add direct `fetch(...)` calls for these flows in feature files.

## PR/Code Change Checklist
- New `/api/*` calls from UI use `apiFetch`.
- New outbound calls from server routes/services are wrapped by `tracedFetch` or `traceAwsCall`.
- If a one-off exception is unavoidable, document why in code comments.
