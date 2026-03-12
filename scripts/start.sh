#!/usr/bin/env bash
# Container entrypoint: run migrations, then start the app.
set -e
cd "$(dirname "$0")/.."

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[start] ERROR: DATABASE_URL is not set; refusing to start."
  exit 1
fi

if [ "${NODE_ENV:-}" = "production" ] && ! [[ "${DATABASE_URL}" =~ [\?\&]sslmode= ]]; then
  separator="?"
  if [[ "${DATABASE_URL}" == *\?* ]]; then
    separator="&"
  fi
  export DATABASE_URL="${DATABASE_URL}${separator}sslmode=require"
  echo "[start] DATABASE_URL missing sslmode; enforcing sslmode=require."
fi

echo "[start] Checking database connectivity..."
node --input-type=module -e "import { Client } from 'pg'; const client = new Client({ connectionString: process.env.DATABASE_URL }); await client.connect(); await client.query('SELECT 1'); await client.end();"
echo "[start] Database connectivity check passed."

echo "[start] Running Prisma migrations..."
pnpm exec prisma migrate deploy --schema=./prisma/schema.prisma
echo "[start] Migrations complete."

if [ "${SEED_TAXONOMY_ON_START:-true}" = "true" ]; then
  echo "[start] Seeding taxonomy..."
  pnpm exec tsx scripts/seed-taxonomy.ts
  echo "[start] Taxonomy seed complete."
else
  echo "[start] SEED_TAXONOMY_ON_START=false, skipping taxonomy seed."
fi

exec pnpm exec tsx server/index.ts
