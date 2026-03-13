import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { auth } from "./auth.js";
import {
  errorHandler,
  requestLogger,
  requireAdmin,
  requireAuth,
  versionCheck,
} from "./middleware/index.js";
import { adminApp } from "./routes/admin.js";
import { healthApp } from "./routes/health.js";
import { libraryApp } from "./routes/library.js";
import { uploadApp } from "./routes/upload.js";
import type { AppVariables } from "./types.js";
import { setSampleAnalysisWorkerEnabled } from "./workers/sample-analysis-state.js";
import { startSampleAnalysisWorker } from "./workers/sample-analysis-worker.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProduction = process.env.NODE_ENV === "production";
const distDir = path.join(__dirname, "..", "dist");

const app = new Hono<{ Variables: AppVariables }>();

// Global error handler
app.onError(errorHandler);

// Global middleware (order matters)
app.use("*", requestLogger);
const corsOrigins = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://*.elb.amazonaws.com", // ALB
  "https://*.octacard.live",
];
const authUrl = process.env.BETTER_AUTH_URL;
if (authUrl && !authUrl.includes("localhost") && !authUrl.includes("127.0.0.1")) {
  corsOrigins.push(authUrl.replace(/\/$/, ""));
}
app.use(
  "*",
  cors({
    origin: corsOrigins,
    credentials: true,
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "X-Client-Version"],
  }),
);
app.use("*", versionCheck);

// /api/auth/* - Better Auth (no body parsing - auth handles raw body)
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// /api/health - no auth
app.route("/api", healthApp); // GET /api/health

// /api/version - client-server compatibility check
app.get("/api/version", (c) =>
  c.json({
    apiVersion: process.env.API_VERSION ?? "1.0.0",
    minClientVersion: process.env.API_MIN_CLIENT_VERSION ?? "1.0.0",
  }),
);

// /api/upload/* - requires auth, body limit for future uploads
app.use("/api/upload/*", requireAuth);
app.use("/api/upload/*", bodyLimit({ maxSize: 10 * 1024 * 1024 })); // 10MB
app.route("/api/upload", uploadApp);

// /api/library/* - authenticated sample/pack APIs
app.use("/api/library/*", requireAuth);
app.use("/api/library/*", bodyLimit({ maxSize: 2 * 1024 * 1024 }));
app.route("/api/library", libraryApp);

// /api/admin/* - admin/superadmin only
app.use("/api/admin/*", requireAdmin);
app.route("/api/admin", adminApp);

// 404 for /api/*
app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));

// Production: serve static SPA from dist/
if (isProduction) {
  app.use("/assets/*", serveStatic({ root: distDir }));
  app.use("/favicon.ico", serveStatic({ root: distDir }));
  app.use("/favicon.png", serveStatic({ root: distDir }));
  app.use("/favicon.svg", serveStatic({ root: distDir }));
  app.use("/logo_white.png", serveStatic({ root: distDir }));
  app.use("/placeholder.svg", serveStatic({ root: distDir }));
  app.use("/robots.txt", serveStatic({ root: distDir }));
  app.use("/privacy-policy.html", serveStatic({ root: distDir }));
  app.use("/terms-of-service.html", serveStatic({ root: distDir }));
  app.use("/release-notes/*", serveStatic({ root: distDir }));
  app.get(
    "*",
    serveStatic({ root: distDir, rewriteRequestPath: () => "/index.html" }),
  );
}

const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
console.log(`[API] Server running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

const sampleAnalysisWorkerEnabled =
  process.env.SAMPLE_ANALYSIS_WORKER_ENABLED !== "false";
setSampleAnalysisWorkerEnabled(sampleAnalysisWorkerEnabled);
console.log(`[worker] Auto-start enabled: ${sampleAnalysisWorkerEnabled}`);
if (sampleAnalysisWorkerEnabled) {
  startSampleAnalysisWorker();
}
if (!sampleAnalysisWorkerEnabled) {
  console.log(
    "[worker] Sample analysis worker disabled (SAMPLE_ANALYSIS_WORKER_ENABLED=false)",
  );
}
