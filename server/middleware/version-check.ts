import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";

/** Minimum client version (semver). Set via env API_MIN_CLIENT_VERSION. */
const MIN_CLIENT_VERSION = process.env.API_MIN_CLIENT_VERSION ?? "1.0.0";

function parseSemver(v: string): [number, number, number] {
  const match = v.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return [0, 0, 0];
  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

function gte(a: [number, number, number], b: [number, number, number]): boolean {
  if (a[0] !== b[0]) return a[0] >= b[0];
  if (a[1] !== b[1]) return a[1] >= b[1];
  return a[2] >= b[2];
}

export const versionCheck: MiddlewareHandler = async (c, next) => {
  const clientVersion = c.req.header("X-Client-Version");
  if (!clientVersion) {
    await next();
    return;
  }

  const min = parseSemver(MIN_CLIENT_VERSION);
  const client = parseSemver(clientVersion);

  if (!gte(client, min)) {
    throw new HTTPException(426, {
      message: "Client upgrade required",
      res: new Response(
        JSON.stringify({
          error: "Client upgrade required",
          minVersion: MIN_CLIENT_VERSION,
          currentVersion: clientVersion,
        }),
        {
          status: 426,
          headers: {
            "Content-Type": "application/json",
            "X-Min-Client-Version": MIN_CLIENT_VERSION,
          },
        }
      ),
    });
  }

  await next();
};
