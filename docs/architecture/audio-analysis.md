# Audio Analysis

Essentia and CLAP for sample analysis. Two pg-boss queues:

- **essentia-analysis**: Decode audio, extract Essentia features (BPM, loudness, energy), Essentia-based taxonomy. On success enqueues clap-analysis.
- **clap-analysis**: CLAP embedding, CLAP zero-shot taxonomy. On success sets analysisStatus READY.

Embeddings stored in PostgreSQL (BYTEA); pgvector migration available for production.
