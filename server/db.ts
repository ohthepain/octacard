import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

function resolveDatabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    throw new Error("[db] DATABASE_URL is not set.");
  }

  // RDS can reject non-TLS clients with "no pg_hba.conf entry ... no encryption".
  if (process.env.NODE_ENV === "production" && !/([?&])sslmode=/.test(rawUrl)) {
    const separator = rawUrl.includes("?") ? "&" : "?";
    return `${rawUrl}${separator}sslmode=require`;
  }

  return rawUrl;
}

const databaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL);

const adapter = new PrismaPg({
  connectionString: databaseUrl,
});

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
