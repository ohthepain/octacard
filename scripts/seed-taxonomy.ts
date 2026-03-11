/**
 * Seed taxonomy attributes and values for V1 sound classification.
 * Run: pnpm exec tsx scripts/seed-taxonomy.ts
 */
import { prisma } from "../server/db.js";
import { TAXONOMY_ATTRIBUTES, TAXONOMY_VALUES } from "../lib/taxonomy.js";

async function main() {
  for (const attrKey of TAXONOMY_ATTRIBUTES) {
    const attr = await prisma.taxonomyAttribute.upsert({
      where: { key: attrKey },
      create: { key: attrKey },
      update: {},
    });

    const values = TAXONOMY_VALUES[attrKey];
    for (const key of values) {
      await prisma.taxonomyValue.upsert({
        where: {
          attributeId_key: { attributeId: attr.id, key: key as string },
        },
        create: {
          attributeId: attr.id,
          key,
        },
        update: {},
      });
    }
    console.log(`Seeded ${attrKey}: ${values.length} values`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
