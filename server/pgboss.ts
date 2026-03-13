/**
 * pg-boss job queue. Uses PostgreSQL (same DB as Prisma).
 * Schema: pgboss (default). Migrations run on boss.start().
 */

import { PgBoss } from "pg-boss";
import { buildPgConnectionConfig } from "./db-connection.js";

const connectionConfig = buildPgConnectionConfig();

export const boss = new PgBoss({
  connectionString: connectionConfig.connectionString,
  ...(connectionConfig.ssl && { ssl: connectionConfig.ssl }),
  schema: "pgboss",
});

boss.on("error", (err) => {
  console.error("[pg-boss] Error:", err?.message ?? err);
});

export async function startPgBoss(): Promise<PgBoss> {
  await boss.start();
  return boss;
}

export async function stopPgBoss(): Promise<void> {
  await boss.stop();
}
