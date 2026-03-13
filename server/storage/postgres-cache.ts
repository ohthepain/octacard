/**
 * PostgreSQL-backed key-value storage for better-auth secondaryStorage.
 * Replaces Redis when ElastiCache is not used.
 *
 * Implements the SecondaryStorage interface:
 * - get(key): returns value or null (checks expiry)
 * - set(key, value, ttl?): stores value; ttl in seconds
 * - delete(key): removes entry
 */

import { prisma } from "../db.js";

const DEFAULT_PREFIX = "better-auth:";

export function createPostgresStorage(prefix = DEFAULT_PREFIX) {
  return {
    async get(key: string): Promise<unknown> {
      const fullKey = prefix + key;
      const row = await prisma.authCache.findUnique({
        where: { key: fullKey },
        select: { value: true, expiresAt: true },
      });
      if (!row) return null;
      if (row.expiresAt && row.expiresAt < new Date()) {
        await prisma.authCache.delete({ where: { key: fullKey } }).catch(() => {});
        return null;
      }
      try {
        return JSON.parse(row.value) as unknown;
      } catch {
        return row.value;
      }
    },
    async set(key: string, value: string, ttl?: number): Promise<void> {
      const fullKey = prefix + key;
      const expiresAt = ttl ? new Date(Date.now() + ttl * 1000) : null;
      await prisma.authCache.upsert({
        where: { key: fullKey },
        create: { key: fullKey, value, expiresAt },
        update: { value, expiresAt },
      });
    },
    async delete(key: string): Promise<void> {
      const fullKey = prefix + key;
      await prisma.authCache.delete({ where: { key: fullKey } }).catch(() => {});
    },
  };
}
