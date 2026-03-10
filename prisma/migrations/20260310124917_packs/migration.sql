-- AlterTable
ALTER TABLE "pack" RENAME CONSTRAINT "project_pkey" TO "pack_pkey";

-- RenameForeignKey
ALTER TABLE "pack" RENAME CONSTRAINT "project_ownerId_fkey" TO "pack_ownerId_fkey";

-- RenameForeignKey
ALTER TABLE "pack" RENAME CONSTRAINT "project_parentId_fkey" TO "pack_parentId_fkey";

-- RenameForeignKey
ALTER TABLE "sample_file" RENAME CONSTRAINT "sample_file_projectId_fkey" TO "sample_file_packId_fkey";

-- RenameIndex
ALTER INDEX "project_name_idx" RENAME TO "pack_name_idx";

-- RenameIndex
ALTER INDEX "project_ownerId_idx" RENAME TO "pack_ownerId_idx";

-- RenameIndex
ALTER INDEX "project_parentId_idx" RENAME TO "pack_parentId_idx";

-- RenameIndex
ALTER INDEX "sample_file_projectId_idx" RENAME TO "sample_file_packId_idx";
