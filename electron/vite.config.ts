import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "main.ts"),
      formats: ["es"],
      fileName: "main",
    },
    outDir: resolve(__dirname, "../dist-electron"),
    rollupOptions: {
      external: ["electron", "path", "url", "fs", "child_process"],
      output: {
        format: "es",
      },
    },
  },
});
