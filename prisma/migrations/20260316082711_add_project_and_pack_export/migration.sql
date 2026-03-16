-- AlterTable
ALTER TABLE "pack" ADD COLUMN     "includeSamples" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "includeStacks" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "project" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Untitled',
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "slots" JSONB NOT NULL DEFAULT '[]',
    "activeSlotIndex" INTEGER NOT NULL DEFAULT 0,
    "previewMode" TEXT NOT NULL DEFAULT 'waveform',
    "bpmAuto" BOOLEAN NOT NULL DEFAULT true,
    "sampleEdits" JSONB NOT NULL DEFAULT '{}',
    "globalTempoBpm" INTEGER NOT NULL DEFAULT 120,
    "timeSignature" JSONB,
    "transportDefaults" JSONB,
    "arrangementMetadata" JSONB,
    "formatSettings" JSONB,

    CONSTRAINT "project_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_userId_key" ON "project"("userId");

-- AddForeignKey
ALTER TABLE "project" ADD CONSTRAINT "project_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
