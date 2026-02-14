/// <reference types="vite/client" />

// Web-based file system API types (replaces Electron API)
import type { fileSystemService, electronAPI } from './lib/fileSystem'

declare global {
  interface Window {
    electron: typeof electronAPI;
  }
}

export {};
