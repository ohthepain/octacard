#!/usr/bin/env bash
# Container entrypoint: run migrations, then start the app.
set -e
cd "$(dirname "$0")/.."

if [ -n "$DATABASE_URL" ]; then
  echo "[start] Running Prisma migrations..."
  pnpm exec prisma migrate deploy --schema=./prisma/schema.prisma
  echo "[start] Migrations complete."
else
  echo "[start] DATABASE_URL not set, skipping migrations."
fi

exec pnpm exec tsx server/index.ts
