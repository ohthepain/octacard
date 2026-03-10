-- Pack pricing fields
ALTER TABLE "pack" ADD COLUMN "defaultSampleTokens" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "pack" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "pack" ADD COLUMN "priceTokens" INTEGER NOT NULL DEFAULT 0;

-- Create sample_content table
CREATE TABLE "sample_content" (
    "id" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sample_content_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sample_content_s3Key_key" ON "sample_content"("s3Key");

-- Migrate existing data: create SampleContent from each SampleFile
INSERT INTO "sample_content" ("id", "s3Key", "contentType", "sizeBytes")
SELECT 'legacy_' || "id", "s3Key", "contentType", "sizeBytes"
FROM "sample_file";

-- Add sampleContentId
ALTER TABLE "sample_file" ADD COLUMN "sampleContentId" TEXT;

-- Backfill
UPDATE "sample_file" SET "sampleContentId" = 'legacy_' || "id";

-- Make it required
ALTER TABLE "sample_file" ALTER COLUMN "sampleContentId" SET NOT NULL;

-- Drop old columns and index
DROP INDEX IF EXISTS "sample_file_s3Key_key";
ALTER TABLE "sample_file" DROP COLUMN "s3Key";
ALTER TABLE "sample_file" DROP COLUMN "contentType";
ALTER TABLE "sample_file" DROP COLUMN "sizeBytes";

-- CreateIndex
CREATE INDEX "sample_file_sampleContentId_idx" ON "sample_file"("sampleContentId");

-- AddForeignKey
ALTER TABLE "sample_file" ADD CONSTRAINT "sample_file_sampleContentId_fkey" FOREIGN KEY ("sampleContentId") REFERENCES "sample_content"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
