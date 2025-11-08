/// <reference types="vite/client" />

interface ElectronAPI {
  fs: {
    readDirectory: (
      dirPath: string
    ) => Promise<{
      success: boolean;
      data?: Array<{ name: string; path: string; type: "file" | "folder"; size: number; isDirectory: boolean }>;
      error?: string;
    }>;
    copyFile: (sourcePath: string, destPath: string) => Promise<{ success: boolean; error?: string }>;
    copyFolder: (sourcePath: string, destPath: string) => Promise<{ success: boolean; error?: string }>;
    getFileStats: (
      filePath: string
    ) => Promise<{ success: boolean; data?: { size: number; isDirectory: boolean; isFile: boolean }; error?: string }>;
    getHomeDirectory: () => Promise<{ success: boolean; data?: string }>;
    deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    deleteFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
    createFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
    getSDCFCards: () => Promise<{ success: boolean; data?: Array<{ path: string; uuid: string }>; error?: string }>;
    getVolumeInfo: (volumePath: string) => Promise<{ success: boolean; data?: { path: string; uuid: string }; error?: string }>;
    revealInFinder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
    ejectVolume: (volumePath: string) => Promise<{ success: boolean; error?: string }>;
    getAudioFileUrl: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
    getAudioFileBlob: (filePath: string) => Promise<{ success: boolean; data?: string; error?: string }>;
    convertAndCopyFile: (
      sourcePath: string,
      destPath: string,
      targetSampleRate?: number,
      sampleDepth?: string,
      fileFormat?: string,
      mono?: boolean,
      normalize?: boolean
    ) => Promise<{ success: boolean; error?: string }>;
    searchFiles: (
      query: string,
      searchPath?: string
    ) => Promise<{
      success: boolean;
      data?: Array<{ name: string; path: string; type: "file" | "folder"; size: number; isDirectory: boolean }>;
      error?: string;
    }>;
  };
  on: {
    sdCardDetected: (callback: (cardPath: string, cardUUID: string) => void) => void;
    sdCardRemoved: (callback: (cardPath: string, cardUUID: string) => void) => void;
  };
  removeListener: (channel: string) => void;
}

declare global {
  interface Window {
    electron: ElectronAPI;
  }
}

export {};
