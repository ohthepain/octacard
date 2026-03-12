import { readFileSync } from "node:fs";
import type { ClientConfig } from "pg";

function normalizePem(value: string): string {
  return value.includes("\\n") ? value.replace(/\\n/g, "\n") : value;
}

function readDatabaseCaCert(): string | undefined {
  const certPath = process.env.DATABASE_CA_CERT_PATH?.trim();
  if (certPath) {
    return readFileSync(certPath, "utf8");
  }

  const certBase64 = process.env.DATABASE_CA_CERT_BASE64?.trim();
  if (certBase64) {
    return Buffer.from(certBase64, "base64").toString("utf8");
  }

  const certRaw = process.env.DATABASE_CA_CERT?.trim();
  if (certRaw) {
    return normalizePem(certRaw);
  }

  return undefined;
}

export function resolveDatabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) {
    throw new Error("[db] DATABASE_URL is not set.");
  }

  if (process.env.NODE_ENV !== "production") {
    return rawUrl;
  }

  // Enforce explicit TLS mode in production for stable pg behavior across upgrades.
  try {
    const url = new URL(rawUrl);
    const sslmode = url.searchParams.get("sslmode");

    if (!sslmode || sslmode === "prefer" || sslmode === "require" || sslmode === "verify-ca") {
      url.searchParams.set("sslmode", "verify-full");
      return url.toString();
    }

    return rawUrl;
  } catch {
    if (!/([?&])sslmode=/.test(rawUrl)) {
      const separator = rawUrl.includes("?") ? "&" : "?";
      return `${rawUrl}${separator}sslmode=verify-full`;
    }
    return rawUrl;
  }
}

export function buildPgConnectionConfig(rawUrl = process.env.DATABASE_URL): ClientConfig {
  const connectionString = resolveDatabaseUrl(rawUrl);
  const caCert = readDatabaseCaCert();

  if (!caCert) {
    return { connectionString };
  }

  return {
    connectionString,
    ssl: {
      ca: caCert,
      rejectUnauthorized: true,
    },
  };
}
