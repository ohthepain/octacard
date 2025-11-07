import { build } from "esbuild";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function buildMain() {
  await build({
    entryPoints: [path.join(__dirname, "main.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "esm",
    outfile: path.join(__dirname, "../dist-electron/main.js"),
    external: ["electron", "ffmpeg-static"],
    sourcemap: true,
  });
  console.log("✓ Main process built");
}

buildMain().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});

