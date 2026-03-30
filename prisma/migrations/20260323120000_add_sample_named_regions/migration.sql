-- CreateTable
CREATE TABLE "sample_named_region" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startSample" INTEGER NOT NULL,
    "endSample" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_named_region_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sample_named_region_sampleId_idx" ON "sample_named_region"("sampleId");

-- AddForeignKey
ALTER TABLE "sample_named_region" ADD CONSTRAINT "sample_named_region_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;
