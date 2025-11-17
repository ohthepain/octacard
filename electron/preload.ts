import { contextBridge, ipcRenderer } from "electron";

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld("electron", {
  fs: {
    readDirectory: (dirPath: string) => ipcRenderer.invoke("fs:readDirectory", dirPath),
    copyFile: (sourcePath: string, destPath: string) => ipcRenderer.invoke("fs:copyFile", sourcePath, destPath),
    copyFolder: (sourcePath: string, destPath: string) => ipcRenderer.invoke("fs:copyFolder", sourcePath, destPath),
    getFileStats: (filePath: string) => ipcRenderer.invoke("fs:getFileStats", filePath),
    getHomeDirectory: () => ipcRenderer.invoke("fs:getHomeDirectory"),
    deleteFile: (filePath: string) => ipcRenderer.invoke("fs:deleteFile", filePath),
    deleteFolder: (folderPath: string) => ipcRenderer.invoke("fs:deleteFolder", folderPath),
    createFolder: (folderPath: string) => ipcRenderer.invoke("fs:createFolder", folderPath),
    getSDCFCards: () => ipcRenderer.invoke("fs:getSDCFCards"),
    getVolumeInfo: (volumePath: string) => ipcRenderer.invoke("fs:getVolumeInfo", volumePath),
    revealInFinder: (filePath: string) => ipcRenderer.invoke("fs:revealInFinder", filePath),
    ejectVolume: (volumePath: string) => ipcRenderer.invoke("fs:ejectVolume", volumePath),
    getAudioFileUrl: (filePath: string) => ipcRenderer.invoke("fs:getAudioFileUrl", filePath),
    getAudioFileBlob: (filePath: string) => ipcRenderer.invoke("fs:getAudioFileBlob", filePath),
    getVideoFileUrl: (filePath: string) => ipcRenderer.invoke("fs:getVideoFileUrl", filePath),
    getVideoFileBlob: (filePath: string) => ipcRenderer.invoke("fs:getVideoFileBlob", filePath),
    convertAndCopyFile: (
      sourcePath: string,
      destPath: string,
      targetSampleRate?: number,
      sampleDepth?: string,
      fileFormat?: string,
      mono?: boolean,
      normalize?: boolean,
      trimStart?: boolean
    ) =>
      ipcRenderer.invoke(
        "fs:convertAndCopyFile",
        sourcePath,
        destPath,
        targetSampleRate,
        sampleDepth,
        fileFormat,
        mono,
        normalize,
        trimStart
      ),
    searchFiles: (query: string, searchPath?: string) =>
      ipcRenderer.invoke("fs:searchFiles", query, searchPath),
    getAvailableVolumes: () => ipcRenderer.invoke("fs:getAvailableVolumes"),
  },
  on: {
    sdCardDetected: (callback: (cardPath: string, cardUUID: string) => void) => {
      ipcRenderer.on("sd-card-detected", (_event, cardPath: string, cardUUID: string) => callback(cardPath, cardUUID));
    },
    sdCardRemoved: (callback: (cardPath: string, cardUUID: string) => void) => {
      ipcRenderer.on("sd-card-removed", (_event, cardPath: string, cardUUID: string) => callback(cardPath, cardUUID));
    },
  },
  removeListener: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
  // Helper function to get file path from File object (Electron-specific)
  getFilePath: (file: File): string | null => {
    // In Electron, File objects from drag-and-drop have a 'path' property
    return (file as any).path || null;
  },
  // Helper function to get file paths from DataTransferItemList
  getFilePathsFromItems: (items: DataTransferItemList): string[] => {
    const paths: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === "file") {
        const file = item.getAsFile();
        if (file) {
          const path = (file as any).path;
          if (path) {
            paths.push(path);
          }
        }
      }
    }
    return paths;
  },
});

// Suppress Electron security warnings in development (they won't appear in production anyway)
// These warnings are expected when webSecurity is disabled for file:// URLs
// Note: In preload context, we suppress these warnings always since they're expected
const originalWarn = console.warn;
console.warn = function (...args: any[]) {
  const message = args.join(" ");
  // Filter out known Electron security warnings
  if (
    message.includes("Electron Security Warning") &&
    (message.includes("webSecurity") ||
      message.includes("allowRunningInsecureContent") ||
      message.includes("Content-Security-Policy") ||
      message.includes("unsafe-eval"))
  ) {
    return; // Suppress these warnings
  }
  originalWarn.apply(console, args);
};

// Log that preload script has loaded
console.log("Preload script loaded, electron API exposed");
