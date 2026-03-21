# The Project Pane

The **Project Pane** is the left column of the main workspace (`ProjectColumn` in `src/components/ProjectColumn.tsx`). It is a **project-scoped launcher**: shortcuts and lists that belong to the **current Octacard project**, separate from the center **source browser** (local `FilePane`, global `RemoteFilePane`, or temp files).

The parent page (`Index.tsx`) wires callbacks so taps here can change **library mode** and **requested paths** in the center column, and **editor mode** / active pack only where that action is about editing a local pack (see the table below).

See also [navigation-pane.md](./navigation-pane.md) and [editor-pane.md](./editor-pane.md).

## Layout

Four collapsible sections (plus section headers with optional actions):

1. **Local Packs**
2. **Local Folders**
3. **Global Packs**
4. **Sample Pool**

**Data (where it lives):** **Local packs** are loaded from the API for the active `projectId`. **Global pack pins** are project-owned references that belong in the **database** with the project (see Global Packs). **Local folder** pins use browser-side favorites storage keyed by volume. **Sample Pool** is static placeholder data in code.

---

## Local Packs

**What they are:** Packs represented in the database (see pack editor / `PackStructurePane`).
They are not the same as local folders.

**Interactions:**

- **+ / New pack** — Opens the **local pack editor** dialog (name and optional cover image). On save, creates the pack and opens it in the pack structure editor (`PackStructurePane`).
- **Click pack** — Opens that pack in the **editor** column (`PackStructurePane`). Does **not** switch `libraryMode` (the center browser stays on global/local/temp as it already was).
- **Pencil** — Reopens the local pack editor to change name or cover after creation.
- **Trash** — Removes the pack from the project on the server

---

## Local Folders

**What they are:** **Pinned shortcuts** to folders on disk that the user works with in **local** library mode. There is **no single “project root”** in the product sense: over time the user can grant access to different folders, drives, and volumes; pins are paths the app can resolve **once the matching filesystem grant is active** in the session (browser File System Access API handles are not permanent across reloads).

Paths are shown as **virtual paths** (e.g. `/Drums/Kicks`) relative to whichever library location is currently mounted for navigation—not “everything must live under one tree you picked once.”

Available only in browsers that support the directory picker / File System Access API (Chromium-based).

**Data:** Stored as **source favorites** via `useFavorites("source", sourceVolumeId)` (`favorites-store`). Entries are keyed by volume id (e.g. `_default` on web) and persist in `localStorage`. Separate from **Global Packs** (see below).

**Interactions:**

- **+ (folder icon)** — Opens a directory picker (often starting from the folder you are already browsing). Adds a shortcut to the chosen folder when the app can resolve it into a navigable path.
- **Drag-and-drop** — Drop a **folder** from the local `FilePane`, or a **directory** from the OS when the browser exposes a handle the app can map to a path, onto the Local Folders area to pin it.
- **Click shortcut** — Switches to **local** `libraryMode` and sets `requestedSourcePath` so the **center** **Local Files** pane navigates to that folder. Does **not** change `editorMode` or clear the active local pack (the right column stays as-is). If no **source** library folder has been chosen yet (no handle), the app opens the folder picker first, then navigates to the pin after a successful choice. Tapping again does not reopen the picker if the session still holds valid handles for that location. After a full reload, the user may need to **Browse** and re-grant access before pins resolve again.
- **Trash** — Removes the pin only (does not delete files on disk).

---

## Global Packs

**What they are:** **Pinned references** to packs from the **global library** (other users’ public packs, etc.) for quick open from this project.

**Data:** These pins are **project data**: they should be stored **in the database** with the project (e.g. library pack id per project), not treated as private browser-only state. The client may use **`project-column-store`** (Zustand + `localStorage`) as a cache or bridge until reads/writes go through the project API.

**Interactions:**

- **+ (browse)** — Switches the source browser to **global** mode and a broad scope so you can find packs.
- **Drag-and-drop** — When the global library exposes `octacardRemoteItems` drag data (pack entries), dropping onto this section adds that pack to the project’s pinned list.
- **Click pack** — Switches to **global** `libraryMode` and opens that pack in the center browser (e.g. `RemoteFilePane` → `PackView`). Does **not** change `editorMode`.
- **Trash** — Removes the pin from this project only.

---

## Sample Pool

**Current behavior:** **Static placeholder UI** only—a hard-coded tree of fake folders and sample names for layout/UX exploration. It is **not** connected to the real library, project state, or playback.

---

## How it fits the rest of the UI

| Pane action          | Typical effect |
| -------------------- | -------------- |
| Open local pack      | `editorMode: pack`, active local pack → `PackStructurePane` in editor column. **`libraryMode` unchanged.** |
| Open local folder    | `libraryMode: local`, `requestedSourcePath` → center (`FilePane`) navigates. **`editorMode` unchanged.** |
| Open global pack pin | `libraryMode: global`, center opens that pack (`RemoteFilePane` → `PackView`). **`editorMode` unchanged.** |
| Browse global (+)    | `libraryMode: global`, widened scope for discovery |

The center column still chooses between **RemoteFilePane**, **TempFilesPane**, and **FilePane** based on `libraryMode`, browser support, temp paths, and whether a disk root is set (`Index.tsx`). The Project Pane does not render the browser; it **drives** it through the handlers above.
