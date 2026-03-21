import type { Context } from "hono";
import type { MiddlewareHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import type { User } from "better-auth";
import { auth } from "../auth.js";
import type { AppVariables } from "../types.js";
import type { RoleName } from "../../generated/prisma/client.js";

/** Throws 401 if user is not in context. Use after optionalAuth for routes that need auth. */
export function requireUser(c: Context<{ Variables: AppVariables }>): User {
  const user = c.get("user");
  if (!user) {
    throw new HTTPException(401, {
      message: "Unauthorized",
      res: new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      ),
    });
  }
  return user;
}

/** Middleware: ensures user is in context, then calls next(). Use after requireAuth. */
export const requireUserMiddleware: MiddlewareHandler = async (c, next) => {
  requireUser(c);
  await next();
};

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

/** Optional auth - sets user/session if present, does not require. Never blocks. */
export const optionalAuth: MiddlewareHandler = async (c, next) => {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (session?.user) {
      c.set("user", session.user);
      c.set("session", session.session);
    }
  } catch {
    // Treat as unauthenticated (e.g. invalid/expired cookie, DB error)
  }
  await next();
};
