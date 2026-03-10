-- RenameTable
ALTER TABLE "project" RENAME TO "pack";

-- RenameColumn
ALTER TABLE "sample_file" RENAME COLUMN "projectId" TO "packId";
