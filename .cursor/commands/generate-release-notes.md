# Generate Release Notes

Generate release notes from git history by reviewing commits and their diffs. Process incrementally and persist progress.

**COMMIT_LIMIT: 10** — Use this value everywhere "N commits" or "commit limit" is referenced below. If the user provides a number after the command (e.g. `/generate-release-notes 5`), use that instead.

## Modes

- **Normal**: Process the next N commits, advance the hash, persist progress.
- **Regenerate**: Re-run the **same** commits as the last run. Use when screenshots have errors, JSON needs fixes, or you want to retry. Does **not** advance the hash. Invoke with `/generate-release-notes regenerate` or `/generate-release-notes --regenerate`.

## Pipeline

```
Git commits → AI summarizes → Structured JSON draft → You curate & enrich → App consumes JSON → Release Mode
```

The **primary output** is structured JSON (`releasenotes-<date>.json`) for the in-app guided demo engine. The app will render a top area with steps, load demo files, and auto-highlight UI elements. PDF is optional for external distribution.

## Steps

### 1. Get the starting and ending commit hashes

**Normal mode:**
- Read `.cursor/release-notes-last-hash.txt` if it exists. Its contents are the last processed commit hash.
- If the file is missing or empty, use `git rev-list --max-parents=0 HEAD` to get the first commit hash.
- This hash is your **start** (exclusive). You will process commits _after_ this one.
- **End** = HEAD (process up to HEAD).

**Regenerate mode:**
- Read `.cursor/release-notes-prev-batch-start.txt`. If missing, report "Cannot regenerate: no previous batch. Run a normal generate first." and stop.
- **Start** = contents of that file.
- Read `.cursor/release-notes-last-hash.txt`. **End** = that hash (process commits up to and including it).
- You will re-run the same batch; do **not** update any hash files at the end.

### 2. Get up to N commits to process

- Run: `git log --oneline <start-hash>..<end-hash>` (in regenerate mode) or `git log --oneline <start-hash>..HEAD` (normal mode).
- Take only the **oldest** N commits (process in chronological order, oldest first), where N = COMMIT_LIMIT.
- For each commit, run `git show <hash> --stat` and `git show <hash>` to inspect the diff.
- If there are no commits, report "No new commits to process" and stop.

### 3. Analyze and write release notes

- For each commit, review the diff and identify user-facing features, fixes, or notable changes.
- Write concise, user-oriented bullet points (e.g., "Added X", "Fixed Y", "Improved Z").
- Collect and Report only USER-FACING FEATURES. Ignore refactors and changes to development scripts and CI jobs
- Group by commit if helpful, or flatten into a single list.

### 4. Update releasenotes.txt

- Create `releasenotes.txt` if it does not exist.
- Get the **commit date** of the last processed hash: `git log -1 --format=%cd --date=short <last-hash>`.
- **Normal mode**: Add a section header `## YYYY-MM-DD` and prepend the release note bullets under it. Use a blank line between sections.
- **Regenerate mode**: Replace the existing section for that date if it exists; otherwise add it as in normal mode.

### 5. Create structured JSON (primary output)

- Create `releasenotes-<date>.json` (e.g. `releasenotes-2026-03-03.json`).
- Use the schema at `schema/release-notes.schema.json` as reference.
- For each USER-FACING FEATURE, add:
  - `id`: unique slug (e.g. `sample-format-dialog`)
  - `title`: display title
  - `include`: true (admin can toggle later)
  - `type`: "feature" | "fix" | "improvement"
  - `demo`: optional `loadSample`, `loadProjectState`, `sourcePath`, `destPath` (paths relative to demo assets)
  - `instructions`: array of steps with `text` and optional `highlight` selector
- Use `data-testid` for `highlight` when available: `[data-testid="format-settings-button"]`. See existing `data-testid` in `src/components/` and `src/pages/Index.tsx`.
- Include `gitHash` (short) from the last processed commit.
- Example:

```json
{
  "version": "1.8.0",
  "releaseDate": "2026-03-03",
  "gitHash": "abc1234",
  "features": [
    {
      "id": "sample-format-dialog",
      "title": "Sample Format Dialog with Conversion Options",
      "include": true,
      "type": "feature",
      "demo": {
        "sourcePath": "/Alpha",
        "destPath": "/Beta"
      },
      "instructions": [
        { "text": "Click the Format button to open format settings", "highlight": "[data-testid=\"format-settings-button\"]" },
        { "text": "Adjust sample rate, depth, mono, or normalize options" }
      ]
    }
  ]
}
```

### 6. Run the app and collect screenshots (Playwright)

- Ensure the app is running: `pnpm run preview:it` (port 3010). Start it in the background if needed.
- Use Playwright (the project already has it). Run a script or use the Playwright API.
- For each USER-FACING FEATURE, review the code and figure out how to reproduce the behavior.
- Navigate to the relevant view, perform any needed interactions, then capture a screenshot.
- Save screenshots to `output/release-notes-screenshots/` with descriptive names. Use alphabetical ordering so they match bullet order (e.g. `01-sample-format-dialog.png`, `02-cf-card-view.png`).
- Use `chromium.launch({ headless: true })` and `page.screenshot({ path: ... })`. See `scripts/integration/smoke.mjs` for patterns.

### 7. Generate PDF (optional)

- If a PDF is needed for external distribution, run: `node scripts/generate-release-notes-pdf.mjs --notes releasenotes.txt --screenshots output/release-notes-screenshots/ --output ReleaseNotes<date>-<githash>.pdf`
- Use the same **commit date** and **last processed hash** for the filename, e.g. `ReleaseNotes2026-03-03-abc1234.pdf`.

### 8. Persist state (normal mode only)

- **Regenerate mode**: Skip this step. Do not update any hash files.
- **Normal mode**:
  - Write the **start** hash you used at the beginning of this run to `.cursor/release-notes-prev-batch-start.txt`. This enables regenerate for the next batch.
  - Write the hash of the **last** commit you processed to `.cursor/release-notes-last-hash.txt` (overwrite the file).
  - This becomes the new "start" for the next run.

## Output format for releasenotes.txt

```markdown
## 2025-03-02

- Added audio export in WAV format
- Fixed playback stutter on Safari
- Improved waveform rendering performance
```

## Output format for releasenotes.pdf (optional)

The PDF contains:

- A title: "Release Notes" with the date and git hash
- The release note bullets from the latest section of releasenotes.txt
- Each screenshot embedded below its corresponding feature bullet (screenshots are matched by order: first bullet → first screenshot, etc.)

## Regenerate command

To regenerate the last batch (e.g. after fixing screenshot errors or JSON):

```
/generate-release-notes regenerate
```

or

```
/generate-release-notes --regenerate
```

## Notes

- Process at most COMMIT_LIMIT commits per run. Run the command again to continue.
- Skip merge commits when counting toward the limit if they add no user-facing changes.
- Focus on user-visible changes; omit internal refactors unless notable.
- The JSON file is the primary output for the app's Release Mode. Curate and enrich it in Admin mode before release.
