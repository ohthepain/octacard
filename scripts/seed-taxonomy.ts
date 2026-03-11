/**
 * Seed taxonomy attributes and values for V1 sound classification.
 * Run: pnpm exec tsx scripts/seed-taxonomy.ts
 */
import { prisma } from "../server/db.js";
import {
  INSTRUMENT_FAMILY_TYPE_MAP,
  TAXONOMY_ATTRIBUTES,
  TAXONOMY_VALUES,
} from "../lib/taxonomy.js";

async function main() {
  const attributes = new Map<string, { id: string; key: string }>();

  for (const attrKey of TAXONOMY_ATTRIBUTES) {
    const attr = await prisma.taxonomyAttribute.upsert({
      where: { key: attrKey },
      create: { key: attrKey },
      update: {},
    });
    attributes.set(attrKey, attr);

    const values = TAXONOMY_VALUES[attrKey];
    for (const [index, key] of values.entries()) {
      await prisma.taxonomyValue.upsert({
        where: {
          attributeId_key: { attributeId: attr.id, key: key as string },
        },
        create: {
          attributeId: attr.id,
          key,
          sortOrder: index,
        },
        update: {
          sortOrder: index,
        },
      });
    }
    console.log(`Seeded ${attrKey}: ${values.length} values`);
  }

  const familyAttr = attributes.get("instrument_family");
  const typeAttr = attributes.get("instrument_type");
  if (!familyAttr || !typeAttr) return;

  const [familyValues, typeValues] = await Promise.all([
    prisma.taxonomyValue.findMany({
      where: { attributeId: familyAttr.id },
      select: { id: true, key: true },
    }),
    prisma.taxonomyValue.findMany({
      where: { attributeId: typeAttr.id },
      select: { id: true, key: true },
    }),
  ]);

  const familyIdByKey = new Map(familyValues.map((item) => [item.key, item.id]));
  const typeIdByKey = new Map(typeValues.map((item) => [item.key, item.id]));

  for (const [familyKey, typeKeys] of Object.entries(INSTRUMENT_FAMILY_TYPE_MAP)) {
    const familyId = familyIdByKey.get(familyKey);
    if (!familyId) continue;
    for (const [index, typeKey] of typeKeys.entries()) {
      const typeId = typeIdByKey.get(typeKey);
      if (!typeId) continue;
      await prisma.taxonomyFamilyType.upsert({
        where: {
          familyValueId_typeValueId: {
            familyValueId: familyId,
            typeValueId: typeId,
          },
        },
        create: {
          familyValueId: familyId,
          typeValueId: typeId,
          sortOrder: index,
        },
        update: {
          sortOrder: index,
        },
      });
    }
  }
  console.log(`Seeded family/type links: ${Object.keys(INSTRUMENT_FAMILY_TYPE_MAP).length} families`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
