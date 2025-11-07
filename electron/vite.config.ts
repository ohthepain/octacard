import { defineConfig } from "vite";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  build: {
    outDir: resolve(__dirname, "../dist-electron"),
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(__dirname, "main.ts"),
      external: [
        "electron",
        "path",
        "url",
        "fs",
        "fs/promises",
        "child_process",
        "util",
        "module",
        "ffmpeg-static",
      ],
      output: {
        format: "es",
        entryFileNames: "main.js",
      },
    },
  },
});
