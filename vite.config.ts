import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig(({ command }) => {
  const debugBuild = command === "build" && process.env.VITE_DEBUG_BUILD === "1";

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    define: debugBuild
      ? {
          // Force React development runtime so invariant errors are not minified.
          // Only enabled for explicit debug builds (e.g. Vercel preview debugging).
          "process.env.NODE_ENV": JSON.stringify("development"),
        }
      : undefined,
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
