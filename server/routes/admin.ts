import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { createBullBoard } from "@bull-board/api";
import { HonoAdapter } from "@bull-board/hono";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { sampleAnalysisQueue } from "../queues/sample-analysis.js";
import { prisma } from "../db.js";
import type { AppVariables } from "../types.js";
import { clearExternalApiTraces, getExternalApiTraces } from "../external-api-trace.js";

const adminApp = new Hono<{ Variables: AppVariables }>();
const INSTRUMENT_FAMILY = "instrument_family";
const INSTRUMENT_TYPE = "instrument_type";

const taxonomyKeySchema = z.object({
  key: z.string().trim().min(1).max(64),
});
const reorderFamiliesSchema = z.object({
  familyIds: z.array(z.string().trim().min(1)).min(1),
});
const reorderTypesSchema = z.object({
  typeIds: z.array(z.string().trim().min(1)).min(1),
});
const networkTracesQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(200),
  errorsOnly: z
    .string()
    .optional()
    .transform((value) => value === "true"),
});

function normalizeTaxonomyKey(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

async function ensureAttribute(attributeKey: string): Promise<{ id: string; key: string }> {
  return prisma.taxonomyAttribute.upsert({
    where: { key: attributeKey },
    update: {},
    create: { key: attributeKey },
    select: { id: true, key: true },
  });
}

async function getTaxonomyEditorState() {
  const [familyAttribute, typeAttribute] = await Promise.all([
    ensureAttribute(INSTRUMENT_FAMILY),
    ensureAttribute(INSTRUMENT_TYPE),
  ]);

  const [families, types, links] = await Promise.all([
    prisma.$queryRaw<Array<{ id: string; key: string }>>`
      SELECT id, key
      FROM "taxonomy_value"
      WHERE "attributeId" = ${familyAttribute.id}
      ORDER BY "sortOrder" ASC, key ASC
    `,
    prisma.$queryRaw<Array<{ id: string; key: string }>>`
      SELECT id, key
      FROM "taxonomy_value"
      WHERE "attributeId" = ${typeAttribute.id}
      ORDER BY "sortOrder" ASC, key ASC
    `,
    prisma.$queryRaw<Array<{ familyValueId: string; typeValueId: string; sortOrder: number }>>`
      SELECT "familyValueId", "typeValueId", "sortOrder"
      FROM "taxonomy_family_type"
    `,
  ]);

  const typeById = new Map(types.map((type) => [type.id, type]));
  const typesByFamilyId = new Map<string, Array<{ id: string; key: string; sortOrder: number }>>();

  for (const link of links) {
    const type = typeById.get(link.typeValueId);
    if (!type) continue;
    const existing = typesByFamilyId.get(link.familyValueId) ?? [];
    existing.push({ ...type, sortOrder: link.sortOrder });
    typesByFamilyId.set(link.familyValueId, existing);
  }

  return {
    families: families.map((family) => ({
      id: family.id,
      key: family.key,
      types: (typesByFamilyId.get(family.id) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key))
        .map(({ id, key }) => ({ id, key })),
    })),
  };
}

const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath("/api/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(sampleAnalysisQueue)],
  serverAdapter,
  options: {
    uiConfig: {
      boardTitle: "OctaCard Queues",
    },
  },
});

adminApp.route("/queues", serverAdapter.registerPlugin());

adminApp.get("/network/traces", zValidator("query", networkTracesQuerySchema), async (c) => {
  const { limit, errorsOnly } = c.req.valid("query");
  return c.json({
    traces: getExternalApiTraces({ limit, errorsOnly }),
  });
});

adminApp.delete("/network/traces", async (c) => {
  clearExternalApiTraces();
  return c.json({ ok: true });
});

adminApp.get("/taxonomy", async (c) => {
  const data = await getTaxonomyEditorState();
  return c.json(data);
});

adminApp.post("/taxonomy/families", zValidator("json", taxonomyKeySchema), async (c) => {
  const input = c.req.valid("json");
  const normalizedKey = normalizeTaxonomyKey(input.key);
  if (!normalizedKey) {
    return c.json({ error: "Invalid key. Use letters, numbers, underscores." }, 400);
  }

  const attribute = await ensureAttribute(INSTRUMENT_FAMILY);
  const existingFamily = await prisma.taxonomyValue.findUnique({
    where: {
      attributeId_key: {
        attributeId: attribute.id,
        key: normalizedKey,
      },
    },
    select: { id: true },
  });

  if (!existingFamily) {
    const familyOrder = await prisma.$queryRaw<Array<{ nextOrder: number | null }>>`
      SELECT MAX("sortOrder") + 1 AS "nextOrder"
      FROM "taxonomy_value"
      WHERE "attributeId" = ${attribute.id}
    `;
    const nextOrder = familyOrder[0]?.nextOrder ?? 0;
    const created = await prisma.taxonomyValue.create({
      data: {
        attributeId: attribute.id,
        key: normalizedKey,
      },
      select: { id: true },
    });

    await prisma.$executeRaw`
      UPDATE "taxonomy_value"
      SET "sortOrder" = ${nextOrder}
      WHERE id = ${created.id}
    `;
  }

  return c.json(await getTaxonomyEditorState());
});

adminApp.patch("/taxonomy/families/reorder", zValidator("json", reorderFamiliesSchema), async (c) => {
  const { familyIds } = c.req.valid("json");
  const familyAttr = await ensureAttribute(INSTRUMENT_FAMILY);
  const existingFamilies = await prisma.taxonomyValue.findMany({
    where: { attributeId: familyAttr.id },
    select: { id: true },
  });

  if (existingFamilies.length !== familyIds.length) {
    return c.json({ error: "Reorder payload must include all families exactly once." }, 400);
  }

  const existingSet = new Set(existingFamilies.map((item) => item.id));
  const providedSet = new Set(familyIds);
  if (providedSet.size !== familyIds.length || familyIds.some((id) => !existingSet.has(id))) {
    return c.json({ error: "Invalid family order payload." }, 400);
  }

  await prisma.$transaction(
    familyIds.map((id, index) => prisma.$executeRaw`
      UPDATE "taxonomy_value"
      SET "sortOrder" = ${index}
      WHERE id = ${id}
    `),
  );

  return c.json(await getTaxonomyEditorState());
});

adminApp.delete("/taxonomy/families/:id", async (c) => {
  const familyId = c.req.param("id");
  const family = await prisma.taxonomyValue.findUnique({
    where: { id: familyId },
    include: { attribute: true },
  });
  if (!family || family.attribute.key !== INSTRUMENT_FAMILY) {
    return c.json({ error: "Family not found" }, 404);
  }

  const linkedTypeIds = await prisma.$queryRaw<Array<{ typeValueId: string }>>`
    SELECT "typeValueId"
    FROM "taxonomy_family_type"
    WHERE "familyValueId" = ${familyId}
  `;

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "taxonomy_family_type"
      WHERE "familyValueId" = ${familyId}
    `;

    await tx.taxonomyValue.delete({ where: { id: familyId } });

    for (const linked of linkedTypeIds) {
      const remainingFamilyLink = await tx.$queryRaw<Array<{ exists: number }>>`
        SELECT 1 as "exists"
        FROM "taxonomy_family_type"
        WHERE "typeValueId" = ${linked.typeValueId}
        LIMIT 1
      `;
      if (remainingFamilyLink.length > 0) continue;

      const annotationCount = await tx.sampleAnnotation.count({
        where: { taxonomyValueId: linked.typeValueId },
      });
      if (annotationCount > 0) continue;

      await tx.taxonomyValue.deleteMany({
        where: { id: linked.typeValueId },
      });
    }
  });

  return c.json(await getTaxonomyEditorState());
});

adminApp.post("/taxonomy/families/:familyId/types", zValidator("json", taxonomyKeySchema), async (c) => {
  const familyId = c.req.param("familyId");
  const input = c.req.valid("json");
  const normalizedKey = normalizeTaxonomyKey(input.key);
  if (!normalizedKey) {
    return c.json({ error: "Invalid key. Use letters, numbers, underscores." }, 400);
  }

  const family = await prisma.taxonomyValue.findUnique({
    where: { id: familyId },
    include: { attribute: true },
  });
  if (!family || family.attribute.key !== INSTRUMENT_FAMILY) {
    return c.json({ error: "Family not found" }, 404);
  }

  const typeAttribute = await ensureAttribute(INSTRUMENT_TYPE);
  const existingType = await prisma.taxonomyValue.findUnique({
    where: {
      attributeId_key: {
        attributeId: typeAttribute.id,
        key: normalizedKey,
      },
    },
    select: { id: true },
  });

  const typeValue =
    existingType ??
    (await prisma.taxonomyValue.create({
      data: {
        attributeId: typeAttribute.id,
        key: normalizedKey,
      },
      select: { id: true },
    }));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM "taxonomy_family_type"
      WHERE "typeValueId" = ${typeValue.id}
      AND "familyValueId" <> ${familyId}
    `;

    const nextOrder = await tx.$queryRaw<Array<{ nextOrder: number | null }>>`
      SELECT MAX("sortOrder") + 1 AS "nextOrder"
      FROM "taxonomy_family_type"
      WHERE "familyValueId" = ${familyId}
    `;

    await tx.$executeRaw`
      INSERT INTO "taxonomy_family_type" ("familyValueId", "typeValueId", "sortOrder")
      VALUES (${familyId}, ${typeValue.id}, ${nextOrder[0]?.nextOrder ?? 0})
      ON CONFLICT ("familyValueId", "typeValueId") DO NOTHING
    `;
  });

  return c.json(await getTaxonomyEditorState());
});

adminApp.patch(
  "/taxonomy/families/:familyId/types/reorder",
  zValidator("json", reorderTypesSchema),
  async (c) => {
    const familyId = c.req.param("familyId");
    const { typeIds } = c.req.valid("json");

    const existing = await prisma.$queryRaw<Array<{ typeValueId: string }>>`
      SELECT "typeValueId"
      FROM "taxonomy_family_type"
      WHERE "familyValueId" = ${familyId}
    `;

    if (existing.length !== typeIds.length) {
      return c.json({ error: "Reorder payload must include all types exactly once." }, 400);
    }

    const existingSet = new Set(existing.map((item) => item.typeValueId));
    const providedSet = new Set(typeIds);
    if (providedSet.size !== typeIds.length || typeIds.some((id) => !existingSet.has(id))) {
      return c.json({ error: "Invalid type order payload." }, 400);
    }

    await prisma.$transaction(
      typeIds.map((typeId, index) =>
        prisma.$executeRaw`
          UPDATE "taxonomy_family_type"
          SET "sortOrder" = ${index}
          WHERE "familyValueId" = ${familyId}
          AND "typeValueId" = ${typeId}
        `,
      ),
    );

    return c.json(await getTaxonomyEditorState());
  },
);

adminApp.delete("/taxonomy/families/:familyId/types/:typeId", async (c) => {
  const familyId = c.req.param("familyId");
  const typeId = c.req.param("typeId");

  await prisma.$executeRaw`
    DELETE FROM "taxonomy_family_type"
    WHERE "familyValueId" = ${familyId}
    AND "typeValueId" = ${typeId}
  `;

  const [remainingFamilyLink, annotationCount] = await Promise.all([
    prisma.$queryRaw<Array<{ exists: number }>>`
      SELECT 1 as "exists"
      FROM "taxonomy_family_type"
      WHERE "typeValueId" = ${typeId}
      LIMIT 1
    `,
    prisma.sampleAnnotation.count({
      where: { taxonomyValueId: typeId },
    }),
  ]);

  if (remainingFamilyLink.length === 0 && annotationCount === 0) {
    await prisma.taxonomyValue.deleteMany({ where: { id: typeId } });
  }

  return c.json(await getTaxonomyEditorState());
});

export { adminApp };
