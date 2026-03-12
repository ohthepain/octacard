# OctaCard - ECS Fargate deployment (linux/arm64 for Graviton)
# Use ubuntu-22.04-arm runner in CI for native arm64 build (npm/pnpm work; no QEMU)
FROM node:20 AS builder

WORKDIR /app

RUN npm install -g pnpm@9.15.0

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .

# Prisma generate in builder (has full deps); schema uses env("DATABASE_URL")
ENV DATABASE_URL="postgresql://localhost:5432/dummy"
RUN pnpm exec prisma generate --schema=./prisma/schema.prisma

RUN pnpm run build

# Production
FROM node:20

WORKDIR /app

# AWS RDS CA bundle for TLS verification (Node.js doesn't include cloud provider CAs by default)
RUN curl -fsSL -o /etc/ssl/certs/rds-global-bundle.pem \
    "https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem" \
    || curl -fsSL -o /etc/ssl/certs/rds-global-bundle.pem \
    "https://s3.amazonaws.com/rds-downloads/rds-combined-ca-bundle.pem"

ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-global-bundle.pem

RUN npm install -g pnpm@9.15.0

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/prisma ./prisma
COPY prisma.config.ts ./
COPY scripts/start.sh ./scripts/start.sh
COPY --from=builder /app/scripts/check-db-connectivity.ts ./scripts/check-db-connectivity.ts
COPY --from=builder /app/scripts/seed-taxonomy.ts ./scripts/seed-taxonomy.ts
RUN chmod +x ./scripts/start.sh

# Generate Prisma client (pnpm stores it in .pnpm; copying from builder doesn't work)
ENV DATABASE_URL="postgresql://localhost:5432/dummy"
RUN pnpm exec prisma generate --schema=./prisma/schema.prisma

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["./scripts/start.sh"]
