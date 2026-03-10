-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_file" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "s3Key" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "credits" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sample_file_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sample_collection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sampleId" TEXT NOT NULL,
    "creditsPaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sample_collection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_ownerId_idx" ON "project"("ownerId");

-- CreateIndex
CREATE INDEX "project_parentId_idx" ON "project"("parentId");

-- CreateIndex
CREATE INDEX "project_name_idx" ON "project"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sample_file_s3Key_key" ON "sample_file"("s3Key");

-- CreateIndex
CREATE INDEX "sample_file_projectId_idx" ON "sample_file"("projectId");

-- CreateIndex
CREATE INDEX "sample_file_ownerId_idx" ON "sample_file"("ownerId");

-- CreateIndex
CREATE INDEX "sample_file_name_idx" ON "sample_file"("name");

-- CreateIndex
CREATE INDEX "sample_file_credits_idx" ON "sample_file"("credits");

-- CreateIndex
CREATE UNIQUE INDEX "sample_collection_userId_sampleId_key" ON "sample_collection"("userId", "sampleId");

-- CreateIndex
CREATE INDEX "sample_collection_sampleId_idx" ON "sample_collection"("sampleId");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_file" ADD CONSTRAINT "sample_file_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_file" ADD CONSTRAINT "sample_file_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_collection" ADD CONSTRAINT "sample_collection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sample_collection" ADD CONSTRAINT "sample_collection_sampleId_fkey" FOREIGN KEY ("sampleId") REFERENCES "sample_file"("id") ON DELETE CASCADE ON UPDATE CASCADE;
