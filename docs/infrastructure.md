# Infrastructure

- remove Redis/Elasticache
- we don't do any pub/sub

- PostgreSQL (AWS RDS)
- AWS Fargate Container Management
- Assets: S3 -> Cloudfront
- Job Queue: pg-boss
- (future) Typesense search
- (future) pgvector for similarity search
- sessions are stored in memory. better-auth is backed by postgres secondary storage
