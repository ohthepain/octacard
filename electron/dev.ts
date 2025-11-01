#!/usr/bin/env node
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import * as path from 'path';
import { createRequire } from 'module';
import { context } from 'esbuild';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const electronDir = __dirname;

async function dev() {
  // Build main and preload in development mode with watch
  const mainCtx = await context({
    entryPoints: [path.join(electronDir, 'main.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'esm',
    outfile: path.join(electronDir, 'main.js'),
    external: ['electron'],
    sourcemap: true,
  });

  const preloadCtx = await context({
    entryPoints: [path.join(electronDir, 'preload.ts')],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs', // Preload scripts must be CommonJS
    outfile: path.join(electronDir, 'preload.js'),
    external: ['electron'],
    sourcemap: true,
  });

  // Initial build
  await Promise.all([
    mainCtx.rebuild().catch((error) => {
      console.error('Main initial build failed:', error);
    }),
    preloadCtx.rebuild().catch((error) => {
      console.error('Preload initial build failed:', error);
    }),
  ]);

  console.log('✓ Initial build complete, starting watch mode...');

  // Start watching (watch() doesn't take options, it just starts watching)
  await Promise.all([
    mainCtx.watch().then(() => {
      console.log('✓ Main watch started');
    }).catch((error) => {
      console.error('Main watch failed:', error);
    }),
    preloadCtx.watch().then(() => {
      console.log('✓ Preload watch started');
    }).catch((error) => {
      console.error('Preload watch failed:', error);
    }),
  ]);

  // Launch electron - use node to run the Electron CLI
  const projectRoot = path.resolve(__dirname, '..');
  const electronCliPath = path.join(projectRoot, 'node_modules', 'electron', 'cli.js');
  const mainJsPath = path.join(electronDir, 'main.js');

  console.log(`Launching Electron...`);
  
  const electron = spawn('node', [electronCliPath, mainJsPath], {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
    },
  });

  electron.on('close', (code) => {
    mainCtx.dispose();
    preloadCtx.dispose();
    process.exit(code || 0);
  });

  electron.on('error', (error) => {
    console.error('Failed to start electron:', error);
    mainCtx.dispose();
    preloadCtx.dispose();
    process.exit(1);
  });
}

dev().catch((error) => {
  console.error('Failed to start:', error);
  process.exit(1);
});



