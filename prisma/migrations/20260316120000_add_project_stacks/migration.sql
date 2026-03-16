-- CreateTable
CREATE TABLE "project_stack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Stack 1',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "slots" JSONB NOT NULL DEFAULT '[]',
    "activeSlotIndex" INTEGER NOT NULL DEFAULT 0,
    "previewMode" TEXT NOT NULL DEFAULT 'single',
    "bpmAuto" BOOLEAN NOT NULL DEFAULT true,
    "globalTempoBpm" INTEGER NOT NULL DEFAULT 120,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_stack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_stack_projectId_idx" ON "project_stack"("projectId");

-- AddForeignKey
ALTER TABLE "project_stack" ADD CONSTRAINT "project_stack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate existing project data to project_stack
INSERT INTO "project_stack" ("id", "projectId", "name", "sortOrder", "slots", "activeSlotIndex", "previewMode", "bpmAuto", "globalTempoBpm", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    "id",
    'Stack 1',
    0,
    "slots",
    "activeSlotIndex",
    "previewMode",
    "bpmAuto",
    "globalTempoBpm",
    "createdAt",
    "updatedAt"
FROM "project";

-- Add activeStackId and set it to the first stack for each project
ALTER TABLE "project" ADD COLUMN "activeStackId" TEXT;

UPDATE "project" p
SET "activeStackId" = (
    SELECT ps."id" FROM "project_stack" ps WHERE ps."projectId" = p."id" ORDER BY ps."sortOrder" ASC LIMIT 1
);

-- Drop old columns from project
ALTER TABLE "project" DROP COLUMN "slots",
DROP COLUMN "activeSlotIndex",
DROP COLUMN "previewMode",
DROP COLUMN "bpmAuto",
DROP COLUMN "globalTempoBpm";
