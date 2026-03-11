CREATE TABLE "taxonomy_family_type" (
    "familyValueId" TEXT NOT NULL,
    "typeValueId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taxonomy_family_type_pkey" PRIMARY KEY ("familyValueId","typeValueId")
);

CREATE INDEX "taxonomy_family_type_typeValueId_idx" ON "taxonomy_family_type"("typeValueId");

ALTER TABLE "taxonomy_family_type" ADD CONSTRAINT "taxonomy_family_type_familyValueId_fkey" FOREIGN KEY ("familyValueId") REFERENCES "taxonomy_value"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "taxonomy_family_type" ADD CONSTRAINT "taxonomy_family_type_typeValueId_fkey" FOREIGN KEY ("typeValueId") REFERENCES "taxonomy_value"("id") ON DELETE CASCADE ON UPDATE CASCADE;
