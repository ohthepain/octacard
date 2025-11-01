import { defineConfig } from 'vite';
import * as path from 'path';

export default defineConfig({
  build: {
    outDir: 'dist-electron',
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'main.ts'),
        preload: path.resolve(__dirname, 'preload.ts'),
      },
      output: {
        entryFileNames: '[name].js',
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
  },
});

