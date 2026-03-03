# Release Mode Design

A lightweight interactive product tour engine powered by structured release data. The app consumes JSON, renders a top area with steps/instructions, loads demo files, and auto-highlights UI elements.

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

- **Top area**: A banner or strip below the header showing:
  - Current step number (e.g. "2 of 5")
  - Instruction text
  - Next / Previous / Skip buttons
  - Optional: "Start tour" entry point
- **Highlight**: Auto-highlight the UI element specified by `instruction.highlight` (e.g. `[data-testid="format-settings-button"]`). Use a spotlight/overlay pattern (dim rest of UI, focus on element).
- **Demo loading**: Before each feature, if `demo` is present:
  - `loadSample`: Load a sample file into the waveform view (if applicable)
  - `loadProjectState`: Restore app state (navigation, selections, etc.)
  - `sourcePath` / `destPath`: Navigate file panes to given virtual paths
- **Entry**: Triggered by URL param or a "What's new" / "Release tour" button in the header or About dialog.

### UX

- Similar to Figma's onboarding or Linear's product tours.
- Non-blocking: user can dismiss or skip at any time.
- Progress persists (optional): remember which steps were completed.

### Data Flow

- Load JSON from `public/release-notes/releasenotes-<version>.json` or a configurable path.
- Filter features by `include: true`.
- Flatten instructions into a linear sequence of steps, or group by feature (user advances through features, then steps within each).

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
      releasenotes-1.8.0.json   # Published release data
  output/
    release-notes-screenshots/  # Screenshots (from generate command)
  scripts/
    generate-release-notes-pdf.mjs  # Optional PDF
  e2e/
    release-notes.spec.ts       # Playwright tests
  src/
    components/
      ReleaseTourBanner.tsx    # Top area with steps
      ReleaseTourHighlight.tsx  # Spotlight overlay
    stores/
      release-tour-store.ts    # Zustand store for tour state
    lib/
      releaseNotes.ts          # Load/parse JSON, types
```

## Implementation Order

1. **Phase 1**: JSON schema + generate command (done)
2. **Phase 2**: `ReleaseTourBanner` + `release-tour-store` — load JSON, render steps, show/hide
3. **Phase 3**: Highlight overlay + selector resolution
4. **Phase 4**: Demo loading (paths, sample, project state)
5. **Phase 5**: Admin mode (edit UI)
6. **Phase 6**: Playwright tests
