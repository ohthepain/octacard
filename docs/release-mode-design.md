# Release Mode Design

A lightweight interactive product tour engine powered by structured release data. The app consumes JSON, renders a release notes section above the header, and lets users explore features with "Show me" buttons that point at UI elements.

## Pipeline Overview

```
Git commits
    ↓
AI summarizes (generate-release-notes command)
    ↓
Structured JSON draft (releasenotes-<date>.json)
    ↓
You curate & enrich (Admin mode)
    ↓
App consumes JSON
    ↓
Release Mode (guided demo)
```

## Release Mode (Guided Demo)

### Behavior

- **Release notes section** (above the header): A branded panel showing:
  - "What's new in v{version}" with release date
  - Current feature title
  - **Step list**: Each instruction with a "Show me" button (when `highlight` is set). Clicking "Show me" draws an animated arrow and box around the target element—no overlay or dimming.
  - **Navigation**: Previous/Next feature, Previous/Next release
  - **Request improvement**: Link to `/vibe-coding-rules.html`
  - **Dismiss** (X) to close
- **Multi-release**: Load from `public/release-notes/index.json`; navigate between releases.
- **Demo loading**: When feature changes, apply `sourcePath`/`destPath` to navigate file panes. Future: `loadSample`, `loadProjectState`.
- **Entry**: URL param `?release-tour=1` or "What's new" in About dialog.

### UX

- Non-blocking: user dismisses at any time.
- On-demand highlight: "Show me" shows arrow/box; auto-clears after ~4s or on click.

### Data Flow

- Load index from `public/release-notes/index.json`.
- Load release JSON from path in index.
- Group by feature; display steps per feature with "Show me" buttons.

## Admin Mode

### Purpose

- Like Figma/Linear: an admin-only mode to edit parts of the demo before release.
- Toggle features on/off (`include`).
- Edit which content to use:
  - Change `demo.loadSample`, `demo.loadProjectState`, `sourcePath`, `destPath`
  - Add/remove/reorder instructions
  - Edit instruction text and highlight selectors
- Preview the tour in real time.

### Access

- Dev mode or a special URL/flag (e.g. `?admin=1` or `?release-admin=1`).
- Or a dedicated admin route (e.g. `/admin/release-notes`) that requires dev mode.

### UI

- Side panel or modal listing features.
- For each feature: checkboxes, text inputs, selector picker (click to pick element).
- Optional: "Pick element" button that lets you click in the app to capture the target element's `data-testid` or selector.

### Persistence

- Edits write back to the JSON file (e.g. via a local API or file write in Electron). For web-only, edits could be stored in localStorage and exported as JSON for manual commit.

## Playwright Tests

### Goal

Automated testing of the release notes experience before release.
- Verify the tour can be loaded and rendered.
- Verify each step's highlight target exists.
- Verify demo loading works (e.g. navigation to paths).
- Optionally: run through the full tour and assert no errors.

### Test Structure

```
e2e/
  release-notes.spec.ts   # or .mjs
```

### Test Cases

1. **Load release notes JSON**
   - App starts with `?release-tour=1` or similar.
   - Assert the top area (step strip) is visible.
   - Assert the first instruction text is displayed.

2. **Highlight targets exist**
   - For each step with `highlight`, assert `page.locator(selector).isVisible()` (or equivalent after navigation).

3. **Demo loading**
   - For features with `demo.sourcePath` / `demo.destPath`, assert the file panes navigate to those paths (or that the app can load them in the mock).

4. **Full tour (optional)**
   - Click Next through all steps.
   - Assert no unhandled errors.

### Integration with Existing Tests

- Reuse `scripts/integration/smoke.mjs` patterns: mock file system, `addInitScript`, etc.
- Release notes tests can run against the same preview server.

### CI

- Add `pnpm run test:release-notes` or include in `test:e2e:coverage` when release notes JSON exists.

## File Layout

```
schema/
  release-notes.schema.json     # JSON schema
public/
  release-notes/
    index.json                  # List of releases (version, date, path)
    releasenotes-*.json         # Published release data
output/
  release-notes-screenshots/    # Screenshots (from generate command)
scripts/
  generate-release-notes-pdf.mjs  # Optional PDF
src/
  components/
    ReleaseNotesPanel.tsx       # Section above header with steps + Show me
    ReleaseTourPointer.tsx     # Arrow/box when Show me is active
  stores/
    release-tour-store.ts       # Zustand store (multi-release, showMe)
  lib/
    releaseNotes.ts             # Load index, load notes, getFeatures
```

## Implementation Order

1. **Phase 1**: JSON schema + generate command (done)
2. **Phase 2**: `ReleaseNotesPanel` + `ReleaseTourPointer` + multi-release store (done)
3. **Phase 3**: Demo loading (paths) (done)
4. **Phase 4**: Admin mode (edit UI)
5. **Phase 5**: Playwright tests
