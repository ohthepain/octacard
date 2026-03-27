# Wave Editor

The Wave Editor is an optional pane, full-width, at the bottom of the screen.

see [panes-layout.md](./panes-layout.md) for the layout.

**Wave / sample editor:** When the waveform editor is open, **`AudioPreview`** is shown (overlay in the main workspace, driven by `useWaveformEditorStore`), not a permanent fourth column.

## Zoom

Zoom is currently broken. We should add zoom in X and Y.

## Slices

The user turns on slices with the 'Slices' toggle button.
Slice detection (sliceDetection.ts) computes slice points based on volume. Each slice point is given a confidence.
The use can tune the number of slices by dragging on the numSlices spin control, selecting the n slices with the highest confidence.
The 'magic' button can use the slices to automatically compute bpm, beat-aligned start and loop points

## Named Regions

In the wave-editor the user can drag over a region, right-click on the selection area, and select 'Create Named Region'.
A named region has a start sample, end sample and a name.
The name defaults to the name of the sample followed by '-' and the region number.
If the user right-clicks on a named region, the popup menu options are to rename, delete, or auto-detect the region.
Auto-detection region trims silence from the start and end of the region.

The user can convert a named region into a PackSample in the pack editor by drag-and-drop into the pack editor.
Samples created from named regions have the same name as the region by default.
