# Editor Pane

The **Editor Pane** is the **right column** of the main layout (see [main-layout.md](./main-layout.md)). Header controls above it (Stack / Pack toggles, waveform button, BPM, Global/Local library toggle, etc.) live in **`Index.tsx`** and affect both this pane and the navigation pane.

## Modes (`editorMode`)

| Mode | Main content | Notes |
| --- | --- | --- |
| **Pack** (`editorMode === "pack"`) | If a **local pack** is selected: `PackStructurePane` (DB-backed structure for that project pack). | Pane title shows the pack name and cover art (`getProjectLocalPackCoverDisplayUrl`); a dashed outline appears when there is no cover. If pack mode is on but no local pack is selected, the title reads “Pack” and a placeholder prompts the user to pick a pack from Local Packs. |
| **Stack** (`editorMode === "stack"`) | If **Multi** preview: `MultiSampleStack`. | If **Single** preview: placeholder text to switch to Multi for stack editing. |

**Preview mode** (`single` vs `multi`) is separate from `editorMode` but coupled in the header (Stack button toggles multi preview when already in stack editor mode).

## Waveform editor

The **waveform / sample editor** is not inside this column: **`AudioPreview`** opens when the waveform editor has a file (or empty state). The header **waveform** button enables/disables that workflow (`useWaveformEditorStore`).

## Gaps / doc TODO

- **Global pack editing** vs browsing: opening a **global** pack primarily affects the **navigation** pane (`RemoteFilePane` / `PackView`); the editor column may still show stack/pack UI depending on mode—worth a short “typical flows” subsection once stable.
- **Export** actions in the header (local pack export vs `ExportPackButton` in stack/multi) are editor-adjacent but not documented here yet.
