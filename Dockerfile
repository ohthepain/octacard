# OctaCard - ECS Fargate deployment (linux/arm64 for Graviton)
# Use ubuntu-22.04-arm runner in CI for native arm64 build (npm/pnpm work; no QEMU)
FROM node:20 AS builder

WORKDIR /app

RUN npm install -g pnpm@9.15.0

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

COPY . .

# Prisma generate in builder (has full deps); v7+ needs DATABASE_URL
ENV DATABASE_URL="postgresql://localhost:5432/dummy"
RUN pnpm exec prisma generate --schema=./prisma/schema.prisma

RUN pnpm run build

# Production - copy node_modules from builder (includes generated Prisma client)
FROM node:20

WORKDIR /app

RUN npm install -g pnpm@9.15.0

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Overlay generated Prisma client from builder (avoids running prisma generate in prod)
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["pnpm", "exec", "tsx", "server/index.ts"]
