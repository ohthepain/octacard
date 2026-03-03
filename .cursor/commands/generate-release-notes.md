# Generate Release Notes

Generate release notes from git history by reviewing commits and their diffs. Process incrementally and persist progress.

**COMMIT_LIMIT: 10** — Use this value everywhere "N commits" or "commit limit" is referenced below. If the user provides a number after the command (e.g. `/generate-release-notes 5`), use that instead.

## Steps

### 1. Get the starting commit hash

- Read `.cursor/release-notes-last-hash.txt` if it exists. Its contents are the last processed commit hash.
- If the file is missing or empty, use `git rev-list --max-parents=0 HEAD` to get the first commit hash.
- This hash is your **start** (exclusive). You will process commits _after_ this one.

### 2. Get up to N commits to process

- Run: `git log --oneline <start-hash>..HEAD` to list commits after the start hash.
- Take only the **oldest** N commits (process in chronological order, oldest first), where N = COMMIT_LIMIT.
- For each commit, run `git show <hash> --stat` and `git show <hash>` to inspect the diff.
- If there are no commits, report "No new commits to process" and stop.

### 3. Analyze and write release notes

- For each commit, review the diff and identify user-facing features, fixes, or notable changes.
- Write concise, user-oriented bullet points (e.g., "Added X", "Fixed Y", "Improved Z").
- Report only user-facing behavior. Ignore refactors and changes to development scripts and CI jobs
- Group by commit if helpful, or flatten into a single list.

### 4. Append to releasenotes.txt

- Create `releasenotes.txt` if it does not exist.
- Add a dated section header, e.g. `## YYYY-MM-DD` (today's date).
- Prepend the release note bullets under that header.
- Use a blank line between sections.

### 5. Persist the last processed hash

- Determine the hash of the **last** commit you processed (the newest of the N you processed).
- Write that hash to `.cursor/release-notes-last-hash.txt` (overwrite the file).
- This becomes the new "start" for the next run.

## Output format for releasenotes.txt

```markdown
## 2025-03-02

- Added audio export in WAV format
- Fixed playback stutter on Safari
- Improved waveform rendering performance
```

## Notes

- Process at most COMMIT_LIMIT commits per run. Run the command again to continue.
- Skip merge commits when counting toward the limit if they add no user-facing changes.
- Focus on user-visible changes; omit internal refactors unless notable.
