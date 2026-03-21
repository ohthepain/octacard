# Octacard Agent Notes

## UX documentation (main layout)

For the three-column shell and what each column is responsible for, see **`docs/ux/`**:

| Doc | Scope |
| --- | --- |
| `docs/ux/main-layout.md` | Columns + optional wave editor |
| `docs/ux/project-pane.md` | Left: `ProjectColumn`, packs, pins |
| `docs/ux/navigation-pane.md` | Center browser / navigation |
| `docs/ux/editor-pane.md` | Right editor |

Cursor also loads **`.cursor/rules/ux-documentation.mdc`** when relevant files are in context (see that file’s `globs`). To surface these docs in **every** chat, set `alwaysApply: true` in that rule’s frontmatter.

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
