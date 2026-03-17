-- CreateTable
CREATE TABLE "pack_favorite" (
    "packId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pack_favorite_pkey" PRIMARY KEY ("packId","userId")
);

-- CreateTable
CREATE TABLE "pack_hide" (
    "packId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pack_hide_pkey" PRIMARY KEY ("packId","userId")
);

-- CreateIndex
CREATE INDEX "pack_favorite_userId_idx" ON "pack_favorite"("userId");

-- CreateIndex
CREATE INDEX "pack_favorite_packId_idx" ON "pack_favorite"("packId");

-- CreateIndex
CREATE INDEX "pack_hide_userId_idx" ON "pack_hide"("userId");

-- CreateIndex
CREATE INDEX "pack_hide_packId_idx" ON "pack_hide"("packId");

-- AddForeignKey
ALTER TABLE "pack_favorite" ADD CONSTRAINT "pack_favorite_packId_fkey" FOREIGN KEY ("packId") REFERENCES "pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_favorite" ADD CONSTRAINT "pack_favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_hide" ADD CONSTRAINT "pack_hide_packId_fkey" FOREIGN KEY ("packId") REFERENCES "pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pack_hide" ADD CONSTRAINT "pack_hide_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
