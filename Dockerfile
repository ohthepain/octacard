# OctaCard - ECS Fargate deployment (linux/arm64 for Graviton)
FROM --platform=linux/arm64 node:20-slim AS builder

WORKDIR /app

RUN corepack enable \
 && corepack prepare pnpm@9.15.0 --activate

# Dependencies (patches required for pnpm patchedDependencies)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Build
COPY . .
RUN pnpm run build

# Production image
FROM --platform=linux/arm64 node:20-slim

WORKDIR /app

RUN apt-get update -y && apt-get install -y --no-install-recommends curl ca-certificates \
  && curl -fsSL "https://github.com/pnpm/pnpm/releases/download/v9.15.0/pnpm-linuxstatic-arm64" -o /bin/pnpm \
  && chmod +x /bin/pnpm \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

# Dependencies (include tsx for running TS server; patches for patchedDependencies)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Built assets and server
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/prisma ./prisma

# Generate Prisma client
RUN pnpm exec prisma generate

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["pnpm", "exec", "tsx", "server/index.ts"]
