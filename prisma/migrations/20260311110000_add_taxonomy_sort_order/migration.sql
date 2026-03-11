ALTER TABLE "taxonomy_value" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked_values AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "attributeId" ORDER BY key) - 1 AS rownum
  FROM "taxonomy_value"
)
UPDATE "taxonomy_value" tv
SET "sortOrder" = rv.rownum
FROM ranked_values rv
WHERE tv.id = rv.id;

ALTER TABLE "taxonomy_family_type" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

WITH ranked_links AS (
  SELECT
    "familyValueId",
    "typeValueId",
    ROW_NUMBER() OVER (PARTITION BY "familyValueId" ORDER BY "createdAt", "typeValueId") - 1 AS rownum
  FROM "taxonomy_family_type"
)
UPDATE "taxonomy_family_type" tft
SET "sortOrder" = rl.rownum
FROM ranked_links rl
WHERE tft."familyValueId" = rl."familyValueId"
  AND tft."typeValueId" = rl."typeValueId";
