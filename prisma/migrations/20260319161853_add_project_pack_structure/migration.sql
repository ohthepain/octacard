-- AlterTable
ALTER TABLE "project_pack" ALTER COLUMN "rootPath" DROP NOT NULL;

-- CreateTable
CREATE TABLE "project_pack_folder" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pack_folder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_pack_entry" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "folderId" TEXT,
    "displayName" TEXT NOT NULL,
    "sourceRef" TEXT NOT NULL,
    "regionStart" DOUBLE PRECISION NOT NULL,
    "regionEnd" DOUBLE PRECISION NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pack_entry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_pack_folder_packId_idx" ON "project_pack_folder"("packId");

-- CreateIndex
CREATE INDEX "project_pack_folder_parentId_idx" ON "project_pack_folder"("parentId");

-- CreateIndex
CREATE INDEX "project_pack_entry_packId_idx" ON "project_pack_entry"("packId");

-- CreateIndex
CREATE INDEX "project_pack_entry_folderId_idx" ON "project_pack_entry"("folderId");

-- AddForeignKey
ALTER TABLE "project_pack_folder" ADD CONSTRAINT "project_pack_folder_packId_fkey" FOREIGN KEY ("packId") REFERENCES "project_pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_pack_folder" ADD CONSTRAINT "project_pack_folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "project_pack_folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_pack_entry" ADD CONSTRAINT "project_pack_entry_packId_fkey" FOREIGN KEY ("packId") REFERENCES "project_pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_pack_entry" ADD CONSTRAINT "project_pack_entry_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "project_pack_folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;
