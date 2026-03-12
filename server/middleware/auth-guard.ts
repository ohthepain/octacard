import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { auth } from "../auth.js";
import type { RoleName } from "../../generated/prisma/client.js";

export const requireAuth: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    throw new HTTPException(401, {
      message: "Unauthorized",
      res: new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    });
  }
  c.set("user", session.user);
  c.set("session", session.session);
  await next();
};

/** Requires admin or superadmin role. Fetches session and checks roles. */
export const requireAdmin: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) {
    throw new HTTPException(401, {
      message: "Unauthorized",
      res: new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    });
  }
  const roles = (session as { roles?: RoleName[] }).roles ?? [];
  const isAdmin = roles.includes("ADMIN" as RoleName) || roles.includes("SUPERADMIN" as RoleName);
  if (!isAdmin) {
    throw new HTTPException(403, {
      message: "Forbidden",
      res: new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      ),
    });
  }
  c.set("user", session.user);
  c.set("session", session.session);
  c.set("roles", roles);
  await next();
};

/** Optional auth - sets user/session if present, does not require. */
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session?.user) {
    c.set("user", session.user);
    c.set("session", session.session);
  }
  await next();
};
