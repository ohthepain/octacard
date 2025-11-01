import { build } from 'esbuild';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const electronDir = path.join(__dirname);
const outDir = path.join(__dirname);

async function buildElectron() {
  // Build main process
  await build({
    entryPoints: [path.join(electronDir, 'main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: path.join(outDir, 'main.js'),
    external: ['electron'],
    sourcemap: true,
  });

  // Build preload script
  await build({
    entryPoints: [path.join(electronDir, 'preload.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs', // Preload scripts must be CommonJS
    outfile: path.join(outDir, 'preload.js'),
    external: ['electron'],
    sourcemap: true,
  });

  console.log('✓ Electron files built successfully');
}

buildElectron().catch((error) => {
  console.error('Build failed:', error);
  process.exit(1);
});

