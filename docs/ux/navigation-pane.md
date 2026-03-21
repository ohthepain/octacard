# Navigation Pane

The **Navigation Pane** is the **center column** of the main layout (see [panes-layout.md](./panes-layout.md)). In code it is not one component: **`Index.tsx`** chooses what to render in the `source-browser` panel based on `libraryMode`, browser support, and path flags (not `editorMode` — the pack editor does not switch the center column away from `FilePane`).

## What can appear here

Rough branching (exact conditions live in `Index.tsx`):

### Global (`libraryMode === "global"`)

- **`globalScope === "rooms"`** → `RoomsTab`
- **Otherwise** → `RemoteFilePane` (search/browse packs; open pack → `PackView` inside that pane)

### Local (`libraryMode === "local"`)

- **Temp / no File System Access API** — `requestedSourcePath` starts with `temp://`, or the browser has no directory picker → `TempFilesPane`
- **Otherwise** (typical Chromium disk library) → `FilePane` (tree; may show `PackView` when the current folder is pack-shaped)

So “navigation” covers **global library**, **rooms**, **temp files**, and **local files**, not only “local folders.”

## Modes

- **Global** — Remote packs, creators filter, pack detail via `PackView` when a pack is open (`openPackId` / in-pane state).
- **Local** — File System Access API-backed browser (`FilePane`) or temp-files UI when the app falls back to that path.

## Relationship to the Project Pane

The left **Project Pane** does not render this column; it **drives** it (e.g. switch to global/local, set `requestedSourcePath`, open a pack id). See [project-pane.md](./project-pane.md).
