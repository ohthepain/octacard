import { Hono } from "hono";

const healthApp = new Hono();

healthApp.get("/health", (c) =>
  c.json({
    ok: true,
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV ?? "development",
    version: process.env.npm_package_version ?? "1.0.0",
  })
);

export { healthApp };
