# OctaCard - ECS Fargate deployment (linux/arm64 for Graviton)
FROM --platform=linux/arm64 node:20-slim AS builder

WORKDIR /app

# Install pnpm (slim has glibc; Alpine/musl causes pnpm install failures)
RUN npm install -g pnpm@9.15.0

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

RUN npm install -g pnpm@9.15.0

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
