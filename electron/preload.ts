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
    revealInFinder: (filePath: string) => ipcRenderer.invoke("fs:revealInFinder", filePath),
    convertAndCopyFile: (
      sourcePath: string,
      destPath: string,
      targetSampleRate?: number,
      sampleDepth?: string,
      fileFormat?: string,
      mono?: boolean,
      normalize?: boolean
    ) =>
      ipcRenderer.invoke("fs:convertAndCopyFile", sourcePath, destPath, targetSampleRate, sampleDepth, fileFormat, mono, normalize),
  },
  on: {
    sdCardDetected: (callback: (cardPath: string) => void) => {
      ipcRenderer.on("sd-card-detected", (_event, cardPath: string) => callback(cardPath));
    },
    sdCardRemoved: (callback: (cardPath: string) => void) => {
      ipcRenderer.on("sd-card-removed", (_event, cardPath: string) => callback(cardPath));
    },
  },
  removeListener: (channel: string) => {
    ipcRenderer.removeAllListeners(channel);
  },
});

// Log that preload script has loaded
console.log("Preload script loaded, electron API exposed");
