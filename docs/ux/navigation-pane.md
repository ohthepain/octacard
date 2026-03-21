# Navigation Pane

The **Navigation Pane** is the **center column** of the main layout (see [panes-layout.md](./panes-layout.md)). In code it is not one component: **`Index.tsx`** chooses what to render in the `source-browser` panel based on `libraryMode`, browser support, `editorMode`, and path flags.

## What can appear here

| Condition (simplified)                                                                | Primary UI                                                                                          |
| ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `libraryMode === "global"` and global scope is **rooms**                              | `RoomsTab`                                                                                          |
| `libraryMode === "global"` (otherwise)                                                | `RemoteFilePane` — search/browse packs; opening a pack drills into **`PackView`** inside that pane  |
| `libraryMode === "local"` and temp / unsupported-FS / certain pack-without-root cases | `TempFilesPane`                                                                                     |
| `libraryMode === "local"` (typical disk library)                                      | `FilePane` — local tree; may embed **`PackView`** when viewing a pack-shaped context in local flows |

So “navigation” covers **global library**, **rooms**, **temp files**, and **local files**, not only “local folders.”

## Modes

- **Global** — Remote packs, creators filter, pack detail via `PackView` when a pack is open (`openPackId` / in-pane state).
- **Local** — File System Access API-backed browser (`FilePane`) or temp-files UI when the app falls back to that path.

## Relationship to the Project Pane

The left **Project Pane** does not render this column; it **drives** it (e.g. switch to global/local, set `requestedSourcePath`, open a pack id). See [project-pane.md](./project-pane.md).
