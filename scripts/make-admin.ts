#!/usr/bin/env tsx
/**
 * Promote a user to admin and superadmin locally.
 * Usage: pnpm run db:make-admin <email-or-name>
 *
 * Looks up user by email (if arg contains @) or by name, then adds ADMIN and SUPERADMIN roles.
 */

import { prisma } from "../server/db.js";
import { RoleName } from "@prisma/client";

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: pnpm run db:make-admin <email-or-name>");
    process.exit(1);
  }

  const isEmail = arg.includes("@");
  const user = isEmail
    ? await prisma.user.findUnique({
        where: { email: arg.trim().toLowerCase() },
      })
    : await prisma.user.findFirst({
        where: { name: { equals: arg, mode: "insensitive" } },
      });

  if (!user) {
    console.error(`User not found: ${arg}`);
    process.exit(1);
  }

  await prisma.userRole.createMany({
    data: [{ userId: user.id, role: RoleName.ADMIN }, { userId: user.id, role: RoleName.SUPERADMIN }],
    skipDuplicates: true,
  });

  console.log(`Promoted ${user.name} (${user.email}) to admin and superadmin.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
