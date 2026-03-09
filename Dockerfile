# OctaCard - ECS Fargate deployment (linux/arm64 for Graviton)
# TARGETPLATFORM set by `docker build --platform`; default for local builds
ARG TARGETPLATFORM=linux/arm64
FROM --platform=$TARGETPLATFORM node:20 AS builder

WORKDIR /app

RUN npm install -g pnpm@9.15.0

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Build
COPY . .
RUN pnpm run build

# Production image
ARG TARGETPLATFORM=linux/arm64
FROM --platform=$TARGETPLATFORM node:20

WORKDIR /app

RUN npm install -g pnpm@9.15.0

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
