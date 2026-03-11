-- CreateEnum
CREATE TYPE "SampleAnalysisStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "sample" ADD COLUMN     "analysisError" TEXT,
ADD COLUMN     "analysisStatus" "SampleAnalysisStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "channels" INTEGER,
ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "sampleRate" INTEGER;

-- CreateTable
CREATE TABLE "sample_attribute" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "sample_attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxonomy_attribute" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "taxonomy_attribute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxonomy_value" (
    "id" TEXT NOT NULL,
    "attributeId" TEXT NOT NULL,
    "key" TEXT NOT NULL,

    CONSTRAINT "taxonomy_value_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_annotation" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "taxonomyValueId" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'rule',
    "rank" INTEGER,

    CONSTRAINT "sample_annotation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_embedding" (
    "id" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL DEFAULT 'v1',
    "dimensions" INTEGER NOT NULL,
    "vector" BYTEA,

    CONSTRAINT "sample_embedding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "taxonomy_value_translation" (
    "id" TEXT NOT NULL,
    "taxonomyValueId" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "taxonomy_value_translation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sample_attribute_sampleId_idx" ON "sample_attribute"("sampleId");

-- CreateIndex
CREATE INDEX "sample_attribute_key_idx" ON "sample_attribute"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sample_attribute_sampleId_key_key" ON "sample_attribute"("sampleId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "taxonomy_attribute_key_key" ON "taxonomy_attribute"("key");

-- CreateIndex
CREATE INDEX "taxonomy_value_attributeId_idx" ON "taxonomy_value"("attributeId");

-- CreateIndex
CREATE UNIQUE INDEX "taxonomy_value_attributeId_key_key" ON "taxonomy_value"("attributeId", "key");

-- CreateIndex
CREATE INDEX "sample_annotation_sampleId_idx" ON "sample_annotation"("sampleId");

-- CreateIndex
CREATE INDEX "sample_annotation_taxonomyValueId_idx" ON "sample_annotation"("taxonomyValueId");

-- CreateIndex
CREATE UNIQUE INDEX "sample_annotation_sampleId_taxonomyValueId_key" ON "sample_annotation"("sampleId", "taxonomyValueId");

-- CreateIndex
CREATE INDEX "sample_embedding_sampleId_idx" ON "sample_embedding"("sampleId");

-- CreateIndex
CREATE UNIQUE INDEX "sample_embedding_sampleId_model_key" ON "sample_embedding"("sampleId", "model");

-- CreateIndex
CREATE INDEX "taxonomy_value_translation_taxonomyValueId_idx" ON "taxonomy_value_translation"("taxonomyValueId");

-- CreateIndex
CREATE UNIQUE INDEX "taxonomy_value_translation_taxonomyValueId_locale_key" ON "taxonomy_value_translation"("taxonomyValueId", "locale");

-- AddForeignKey
ALTER TABLE "sample_attribute" ADD CONSTRAINT "sample_attribute_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxonomy_value" ADD CONSTRAINT "taxonomy_value_attributeId_fkey" FOREIGN KEY ("attributeId") REFERENCES "taxonomy_attribute"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_annotation" ADD CONSTRAINT "sample_annotation_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_annotation" ADD CONSTRAINT "sample_annotation_taxonomyValueId_fkey" FOREIGN KEY ("taxonomyValueId") REFERENCES "taxonomy_value"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_embedding" ADD CONSTRAINT "sample_embedding_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "sample"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taxonomy_value_translation" ADD CONSTRAINT "taxonomy_value_translation_taxonomyValueId_fkey" FOREIGN KEY ("taxonomyValueId") REFERENCES "taxonomy_value"("id") ON DELETE CASCADE ON UPDATE CASCADE;
