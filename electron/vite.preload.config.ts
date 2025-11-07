import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "preload.ts"),
      formats: ["cjs"],
      fileName: () => "preload.js",
    },
    outDir: resolve(__dirname, "../dist-electron"),
    emptyOutDir: false,
    rollupOptions: {
      external: ["electron"],
      output: {
        format: "cjs",
      },
    },
  },
});

