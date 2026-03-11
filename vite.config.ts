/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";

type PreviewMiddleware = (req: IncomingMessage, res: ServerResponse, next: () => void) => void;

function canWriteProxyResponse(
  value: unknown,
): value is Pick<ServerResponse, "writeHead" | "end"> {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { writeHead?: unknown; end?: unknown };
  return typeof candidate.writeHead === "function" && typeof candidate.end === "function";
}

function resolveAppVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(path.resolve(__dirname, "package.json"), "utf-8"));
    return pkg.version ?? "1.0.0";
  } catch {
    return "1.0.0";
  }
}

function resolveGitSha(): string {
  const envSha =
    process.env.GIT_COMMIT_SHA ||
    process.env.GITHUB_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
    process.env.SOURCE_VERSION;

  if (envSha && /^[0-9a-f]{7,40}$/i.test(envSha)) return envSha;

  try {
    return execSync("git rev-parse HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig(({ command }) => {
  const debugBuild = command === "build" && process.env.VITE_DEBUG_BUILD === "1";
  const gitSha = resolveGitSha();
  const gitShaShort = gitSha === "unknown" ? gitSha : gitSha.slice(0, 7);
  const appVersion = resolveAppVersion();

  const apiAuthFallbackPlugin = {
    name: "api-auth-fallback",
    configurePreviewServer(server: { middlewares: { stack: Array<{ route: string; handle: PreviewMiddleware }> } }) {
      const handler: PreviewMiddleware = (req, res, next) => {
        if ((req.url ?? "").startsWith("/api/auth/")) {
          res.setHeader("Content-Type", "application/json");
          res.statusCode = 200;
          res.end(JSON.stringify({ user: null, session: null }));
          return;
        }
        next();
      };
      server.middlewares.stack.unshift({ route: "", handle: handler });
    },
  };

  return {
    plugins: [react(), apiAuthFallbackPlugin],
    test: {
      globals: true,
      environment: "jsdom",
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
      coverage: {
        provider: "v8",
        reporter: ["text", "html", "lcov", ["json", { file: "coverage-final.json" }]],
        reportsDirectory: "./coverage/unit",
        include: ["src/**/*.{ts,tsx}"],
        exclude: ["src/**/*.d.ts", "src/**/*.{test,spec}.{ts,tsx}", "src/main.tsx", "src/routeTree.gen.ts"],
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      __GIT_SHA__: JSON.stringify(gitSha),
      __GIT_SHA_SHORT__: JSON.stringify(gitShaShort),
      __APP_VERSION__: JSON.stringify(appVersion),
      ...(debugBuild
        ? {
            // Force React development runtime so invariant errors are not minified.
            // Only enabled for explicit debug builds (e.g. ALB debugging).
            "process.env.NODE_ENV": JSON.stringify("development"),
          }
        : {}),
    },
    esbuild: debugBuild
      ? {
          keepNames: true,
        }
      : undefined,
    build: debugBuild
      ? {
          sourcemap: true,
          minify: false,
          cssMinify: false,
        }
      : undefined,
    optimizeDeps: {
      // FFmpeg WASM worker loading can hang or fail with wrong MIME type when pre-bundled
      exclude: ["@ffmpeg/ffmpeg", "@ffmpeg/util"],
    },
    server: {
      port: 3000,
      allowedHosts: ["dithionous-shantelle-uncleft.ngrok-free.dev"],
      headers: {
        // Required for FFmpeg WASM (SharedArrayBuffer) - cross-origin isolation
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
      proxy: {
        // API - Hono server runs on 3001 in dev
        "/api": {
          target: "http://127.0.0.1:3001",
          changeOrigin: true,
          configure: (proxy) => {
            proxy.on("error", (_err, req, res) => {
              if (canWriteProxyResponse(res)) {
                const isAuth = (req.url ?? "").includes("/api/auth/");
                res.writeHead(isAuth ? 200 : 503, {
                  "Content-Type": "application/json",
                });
                res.end(
                  isAuth
                    ? JSON.stringify({ user: null, session: null })
                    : JSON.stringify({ error: "Service unavailable" }),
                );
              }
            });
          },
        },
        // PostHog reverse proxy - avoids ad blockers, use /ph path (not /analytics etc)
        "/ph/static": {
          target: "https://eu-assets.i.posthog.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/ph/, ""),
        },
        "/ph": {
          target: "https://eu.i.posthog.com",
          changeOrigin: true,
          secure: true,
          rewrite: (path) => path.replace(/^\/ph/, ""),
        },
      },
    },
    preview: {
      headers: {
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
      },
    },
  };
});
