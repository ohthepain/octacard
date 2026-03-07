import type { MiddlewareHandler } from "hono";

export const requestLogger: MiddlewareHandler = async (c, next) => {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;
  const ua = c.req.header("user-agent") ?? "-";

  await next();

  const duration = Date.now() - start;
  const status = c.res.status;
  const logLine = `${method} ${path} ${status} ${duration}ms - ${ua}`;
  console.log(`[API] ${logLine}`);
};
