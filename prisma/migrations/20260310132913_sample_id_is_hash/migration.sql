-- Migrate sample_content -> sample (rename)
ALTER TABLE "sample_content" RENAME TO "sample";
ALTER TABLE "sample" RENAME CONSTRAINT "sample_content_pkey" TO "sample_pkey";
ALTER INDEX "sample_content_s3Key_key" RENAME TO "sample_s3Key_key";

-- Migrate sample_collection: sampleId was sample_file.id, must become sampleContentId (hash)
UPDATE "sample_collection" sc
SET "sampleId" = sf."sampleContentId"
FROM "sample_file" sf
WHERE sc."sampleId" = sf."id";

-- Create pack_sample from sample_file
CREATE TABLE "pack_sample" (
    "packId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pack_sample_pkey" PRIMARY KEY ("packId","sampleId")
);

INSERT INTO "pack_sample" ("packId", "sampleId", "name", "ownerId", "credits", "createdAt", "updatedAt")
SELECT "packId", "sampleContentId", "name", "ownerId", "credits", "createdAt", "updatedAt"
FROM "sample_file";

-- Drop old FKs and table
ALTER TABLE "sample_collection" DROP CONSTRAINT IF EXISTS "sample_collection_sampleId_fkey";
ALTER TABLE "sample_file" DROP CONSTRAINT "sample_file_ownerId_fkey";
ALTER TABLE "sample_file" DROP CONSTRAINT "sample_file_packId_fkey";
ALTER TABLE "sample_file" DROP CONSTRAINT "sample_file_sampleContentId_fkey";
DROP TABLE "sample_file";

-- CreateIndex
CREATE INDEX "pack_sample_ownerId_idx" ON "pack_sample"("ownerId");
CREATE INDEX "pack_sample_name_idx" ON "pack_sample"("name");
CREATE INDEX "pack_sample_credits_idx" ON "pack_sample"("credits");
CREATE INDEX "pack_sample_sampleId_idx" ON "pack_sample"("sampleId");

-- AddForeignKey
ALTER TABLE "pack_sample" ADD CONSTRAINT "pack_sample_packId_fkey" FOREIGN KEY ("packId") REFERENCES "pack"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pack_sample" ADD CONSTRAINT "pack_sample_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pack_sample" ADD CONSTRAINT "pack_sample_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "sample"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sample_collection" ADD CONSTRAINT "sample_collection_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;
