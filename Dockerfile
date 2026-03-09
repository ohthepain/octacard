# OctaCard - ECS Fargate deployment (linux/arm64 for Graviton)
FROM --platform=linux/arm64 node:20-slim AS builder

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

# package.json must be present so corepack reads packageManager field
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN corepack enable

RUN pnpm install --frozen-lockfile

# Build
COPY . .
RUN pnpm run build

# Production image
FROM --platform=linux/arm64 node:20-slim

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN corepack enable

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
