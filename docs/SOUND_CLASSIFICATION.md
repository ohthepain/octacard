# Sound Classification (V1)

Sample analysis pipeline for faceted search, similarity, and text-to-audio retrieval.

## Architecture

- **Taxonomy**: Canonical term IDs (instrument_family, instrument_type, style, descriptor, mood). Raw model output is interpreted by a rule layer and mapped to these IDs.
- **Embeddings**: CLAP (512-dim) for text-to-audio and vibe search. Stored as BYTEA; pgvector migration available for production.
- **Essentia**: BPM (RhythmExtractor2013), loudness, energy. Stored in `SampleAttribute`.
- **Worker**: BullMQ + Redis. One job per sample: Essentia features, CLAP embedding, taxonomy assignment.

## Data Model

- `Sample` – file metadata, `analysisStatus` (PENDING | PROCESSING | READY | FAILED)
- `SampleAttribute` – numeric values (bpm, loudness, energy from Essentia; brightness, etc. later)
- `TaxonomyAttribute` / `TaxonomyValue` – controlled vocabulary
- `SampleAnnotation` – sample ↔ taxonomy value, confidence, source
- `SampleEmbedding` – sample ↔ model, vector (512-dim for CLAP)

## Setup

1. **Seed taxonomy** (run once):
   ```bash
   pnpm run db:seed-taxonomy
   ```

2. **Worker startup**
   - Default: worker auto-starts inside the API process (`pnpm run dev`, container startup).
   - Optional: disable embedded worker with `SAMPLE_ANALYSIS_WORKER_ENABLED=false` and run dedicated worker process(es):
   ```bash
   pnpm run worker:sample-analysis
   ```

3. **Upload samples** – analysis is enqueued automatically when samples are created via `/samples/from-content`.

## API Endpoints

| Method | Path | Description |
|--------|------|--------------|
| GET | `/api/library/samples/search` | Faceted search (instrument_type, style, bpm, duration, etc.) |
| POST | `/api/library/samples/search/similar` | Nearest neighbors from sample ID (audio-to-audio) |
| POST | `/api/library/samples/search/text-search` | Text query vs stored CLAP embeddings |

### Faceted Search Query Params

- `instrument_family`, `instrument_type`, `style`, `descriptor`, `mood` – taxonomy filters
- `bpmMin`, `bpmMax` – BPM range (from SampleAttribute)
- `durationMinMs`, `durationMaxMs` – duration range
- `limit`, `offset` – pagination

### Similar Samples

```json
POST /api/library/samples/search/similar
{ "sampleId": "...", "limit": 10 }
```

### Text Search

```json
POST /api/library/samples/search/text-search
{ "query": "dark dusty snares", "limit": 20 }
```

## V1 Taxonomy

| Attribute | Values |
|-----------|--------|
| instrument_family | drum, synth, bass, fx, texture |
| instrument_type | kick, snare, clap, hat, tom, cymbal, pad, lead, pluck, stab, bass, riser |
| style | lofi, techno, house, cinematic, trap, ambient |
| descriptor | warm, bright, dark, punchy, dusty, metallic, distorted, clean, crunchy, wide, dry |
| mood | aggressive, soft, uplifting, tense, moody |

## Future: pgvector

For production scale, add pgvector extension and migrate `SampleEmbedding.vector` from BYTEA to `vector(512)`. Use `<=>` for cosine distance in SQL.
