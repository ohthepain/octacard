# OctaCard - ECS Fargate deployment (linux/arm64 for Graviton)
# Use ubuntu-22.04-arm runner in CI for native arm64 build (npm/pnpm work; no QEMU)
FROM node:20 AS builder

WORKDIR /app

RUN npm install -g pnpm@9.15.0

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Production
FROM node:20

WORKDIR /app

RUN npm install -g pnpm@9.15.0

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/prisma ./prisma

# Prisma v7+ requires DATABASE_URL; dummy value for generate (no DB connection)
ENV DATABASE_URL="postgresql://localhost:5432/dummy"
RUN pnpm exec prisma generate

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["pnpm", "exec", "tsx", "server/index.ts"]
