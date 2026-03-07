import Redis from "ioredis";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";

export const redis = new Redis(redisUrl, {
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
});

export function createRedisStorage(prefix = "better-auth:") {
  return {
    async get(key: string): Promise<unknown> {
      const val = await redis.get(prefix + key);
      if (!val) return null;
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    },
    async set(key: string, value: string, ttl?: number): Promise<void> {
      const fullKey = prefix + key;
      if (ttl) {
        await redis.setex(fullKey, ttl, value);
      } else {
        await redis.set(fullKey, value);
      }
    },
    async delete(key: string): Promise<void> {
      await redis.del(prefix + key);
    },
  };
}
