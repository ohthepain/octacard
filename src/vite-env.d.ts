/// <reference types="vite/client" />

interface ElectronAPI {
  fs: {
    readDirectory: (dirPath: string) => Promise<{ success: boolean; data?: Array<{ name: string; path: string; type: 'file' | 'folder'; size: number; isDirectory: boolean }>; error?: string }>;
    copyFile: (sourcePath: string, destPath: string) => Promise<{ success: boolean; error?: string }>;
    copyFolder: (sourcePath: string, destPath: string) => Promise<{ success: boolean; error?: string }>;
    getFileStats: (filePath: string) => Promise<{ success: boolean; data?: { size: number; isDirectory: boolean; isFile: boolean }; error?: string }>;
    getHomeDirectory: () => Promise<{ success: boolean; data?: string }>;
    deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    deleteFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  };
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
