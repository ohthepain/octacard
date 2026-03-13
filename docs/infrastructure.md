# Infrastructure

## Overview

Octacard runs on AWS with PostgreSQL as the primary database. Redis/ElastiCache has been removed; job queues and auth cache use PostgreSQL.

## Components

### PostgreSQL (AWS RDS)

- Primary database for all application data
- Prisma ORM with migrations
- pg-boss uses the same database (schema: `pgboss`) for job queues

### Job Queue: pg-boss

- PostgreSQL-based job queue (no Redis)
- Queues: `essentia-analysis`, `clap-analysis`
- Schema and migrations run on `boss.start()`
- See [SOUND_CLASSIFICATION.md](SOUND_CLASSIFICATION.md) for pipeline details

### better-auth Storage

- Primary: PostgreSQL via Prisma adapter
- Secondary: PostgreSQL-backed key-value cache (`auth_cache` table) for sessions and rate limiting (replaces Redis)

### AWS Fargate

- Container management for the API + workers
- Single task runs API server, Essentia worker, and CLAP worker

### Assets

- S3 for sample uploads
- CloudFront for delivery (when domain configured)

## Future

- Typesense search
- pgvector for similarity search

