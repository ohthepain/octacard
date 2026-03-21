-- CreateTable
CREATE TABLE "project_pack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rootPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_pack_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_pack_projectId_idx" ON "project_pack"("projectId");

-- AddForeignKey
ALTER TABLE "project_pack" ADD CONSTRAINT "project_pack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
