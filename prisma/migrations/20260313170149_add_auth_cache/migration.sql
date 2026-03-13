-- CreateTable
CREATE TABLE "auth_cache" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_cache_pkey" PRIMARY KEY ("key")
);
