# OctaCard

## Project description

OctaCard is a browser-based sample manager. It focuses on fast folder navigation, preview, and bulk copy/conversion into device-friendly formats. It was originally designed for Elektron Octatrack but also works perfectly for
many other devices

## Why use this project

- Browser-based, no install required
- It is purpose-built for source-folder -> destination-folder sample prep, convenient for removable storage
- It runs locally in Chromium browsers using the File System Access API - no cloud processing.
- It combines file management, preview, favorites, and batch conversion in one UI.
- It can convert/copy whole folder trees while preserving structure.
- Device presets for sample formats

## Features (current)

### File and folder workflow

- Dual-pane source/destination browser.
- Folder favorites per pane.
- Search, recursive browsing, and folder expansion state persistence.
- Drag/drop and context-menu actions for copy/convert flows.
- Tempo conversion based on common file and folder name patterns
- Pitch conversion based on filename

### Conversion workflow

- Batch convert or copy selected files/folders.
- Output format control for Octatrack prep:
  - WAV output
  - 44.1 kHz or 48 kHz sample rate
  - 16-bit depth
  - Mono downmix
  - Loudness normalization
  - Trim leading silence
  - Pitch-to-C (filename note parsing)

### Preview and UX

### Compatibility and limits

- Designed for Chrome/Edge/Chromium browsers.
- Safari is not supported (File System Access API limitation).
- No sample editing functionality

## Comparison with similar tools

Legend: `Yes` = core supported workflow, `Partial` = possible but not the primary UX, `No` = not a core feature.

| Capability                        | OctaCard | Elektron Transfer               | Sononym | fre:ac | Audacity | FFmpeg CLI |
| --------------------------------- | -------- | ------------------------------- | ------- | ------ | -------- | ---------- |
| Octatrack-oriented workflow       | Yes      | Partial (device transfer focus) | No      | No     | No       | No         |
| Batch folder conversion           | Yes      | No                              | No      | Yes    | Partial  | Yes        |
| Built-in waveform preview/player  | Yes      | No                              | Yes     | No     | Yes      | No         |
| Similarity-based sample discovery | No       | No                              | Yes     | No     | No       | No         |
| Multi-track editing/recording     | No       | No                              | No      | No     | Yes      | No         |
| Command-line automation           | No       | No                              | No      | No     | No       | Yes        |
| Runs as browser app               | Yes      | No                              | No      | No     | No       | No         |

## Gaps (on purpose or not built yet)

- No drag and drop yet
- No sample editing
- No metadata/tag library management.
- Browser support depends on File System Access API.

## Development

```sh
pnpm install
pnpm run dev
```

## Integration tests

```sh
npm run test:it
```

## Sources used for comparison

- Elektron Transfer FAQ: https://support.elektron.se/support/solutions/articles/43000572495-elektron-transfer-faq
- Sononym home/features: https://www.sononym.net/
- fre:ac feature overview: https://www.freac.org/
- Audacity manual (editing/mixing workflows): https://manual.audacityteam.org/man/tutorial_your_first_recording.html
- FFmpeg documentation/CLI scope: https://ffmpeg.org/ffmpeg-all.html

## How can I deploy this project?

For web deployment, you can use platforms like Vercel, Netlify, or Cloudflare Pages. Build the project with `pnpm run build` and deploy the output from the `dist` directory.
