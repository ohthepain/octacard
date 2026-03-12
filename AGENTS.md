# Octacard Agent Notes

## Request Manager Rule
- Route **all client -> server** requests through `src/lib/api-client.ts` (`apiFetch`).
- Route **all server -> external service** calls through `server/external-api-trace.ts` (`tracedFetch` for HTTP, `traceAwsCall` for SDK calls).
- Do **not** add direct `fetch(...)` calls for these flows in feature files.

## Lint / Accessibility Rules
- **noArrayIndexKey**: Use stable IDs (e.g. `item.id`, `item.key`) as React `key`, not array index. For static lists without IDs (e.g. `Array.from({ length: n })`), prefer content-based keys or add a `biome-ignore` with a short comment if index is truly stable.
- **noStaticElementInteractions / useSemanticElements**: Use semantic elements for interactive UI. Prefer `<button>` over `<div role="button">`; prefer `<a>` over `<span role="link">`. Avoid `onClick` on plain `<div>`/`<span>` without a proper role.
- **useFocusableInteractive**: Elements with interactive roles (e.g. `role="link"`) must be focusable. Add `tabIndex={0}` or use the semantic element (`<a>`, `<button>`) which is focusable by default.
- **useKeyWithClickEvents**: If an element has `onClick`, add `onKeyDown` (or `onKeyUp`) for keyboard activation, e.g. `onKeyDown={(e) => e.key === 'Enter' && handler()}`. Or use a semantic `<button>` which handles this automatically.

## PR/Code Change Checklist
- New `/api/*` calls from UI use `apiFetch`.
- New outbound calls from server routes/services are wrapped by `tracedFetch` or `traceAwsCall`.
- If a one-off exception is unavoidable, document why in code comments.
