import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electron', {
  fs: {
    readDirectory: (dirPath: string) => ipcRenderer.invoke('fs:readDirectory', dirPath),
    copyFile: (sourcePath: string, destPath: string) => ipcRenderer.invoke('fs:copyFile', sourcePath, destPath),
    copyFolder: (sourcePath: string, destPath: string) => ipcRenderer.invoke('fs:copyFolder', sourcePath, destPath),
    getFileStats: (filePath: string) => ipcRenderer.invoke('fs:getFileStats', filePath),
    getHomeDirectory: () => ipcRenderer.invoke('fs:getHomeDirectory'),
  },
});

// Log that preload script has loaded
console.log('Preload script loaded, electron API exposed');

