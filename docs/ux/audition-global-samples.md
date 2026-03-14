# Auditioning Samples from Packs in the Cloud

A global sample is a sample that exists in a pack on the server, not in a local folder.

## Temporary storage (audition cache)

Global samples are downloaded into a temporary LRU cache (IndexedDB, max 50MB) when the user auditions them. The cache is cleared automatically when it exceeds the size limit (least-recently-used entries are evicted first). Files are not cleared on tab close—the cache persists across refreshes for a snappier experience.

## Drag operations

- **Drag a sample from global to local folder** — sample is copied right into the target folder
- **Drag a sample from global to local pack** — warn: "Are you sure you want to edit this pack?"; if confirmed, pack opens in PackView in edit mode, sample is downloaded into the pack folder
- **Drag a sample from global to stack block** — sample is added to the stack and loaded from the audition cache
- **Drag a pack from global to local** — pack is downloaded into the local folder (cache is checked first for already-auditioned samples)
- **Drag a pack from global to stack area** — up to 8 samples from the pack are added to the stack blocks

## Audition UX flows

- **Play button** — Each sample (local and remote) has a play button in the filepane. When playing, it turns into a stop button.
- **Tap the sample** — Opens the wave view and loads the sample from the audition cache (or downloads on first access). The user can play the sample just like a local file.
- **Drag into stack block** — Sample is added to the stack and resolved from the audition cache for playback.
