import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { execSync } from "node:child_process";

function resolveGitSha(): string {
  const envSha =
    process.env.VERCEL_GIT_COMMIT_SHA ||
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

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: {
      __GIT_SHA__: JSON.stringify(gitSha),
      __GIT_SHA_SHORT__: JSON.stringify(gitShaShort),
      ...(debugBuild
        ? {
            // Force React development runtime so invariant errors are not minified.
            // Only enabled for explicit debug builds (e.g. Vercel preview debugging).
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
      headers: {
        // Required for FFmpeg WASM (SharedArrayBuffer) - cross-origin isolation
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
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
