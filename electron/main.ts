import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

const createWindow = () => {
  // Create the browser window
  const preloadPath = path.join(__dirname, "preload.js");
  console.log("Loading preload script from:", preloadPath);

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
  });

  // Debug: Check if preload script exists
  fs.access(preloadPath)
    .then(() => console.log("✓ Preload script exists"))
    .catch(() => console.error("✗ Preload script NOT found at:", preloadPath));

  // Load the app
  if (isDev) {
    mainWindow.loadURL("http://localhost:8080");
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
};

// IPC Handlers for file system operations
ipcMain.handle("fs:readDirectory", async (_event, dirPath: string) => {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    const result = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(dirPath, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? "folder" : "file",
          size: stats.size,
          isDirectory: entry.isDirectory(),
        };
      })
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("fs:copyFile", async (_event, sourcePath: string, destPath: string) => {
  try {
    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(sourcePath, destPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

async function copyFolderRecursive(sourcePath: string, destPath: string): Promise<void> {
  await fs.mkdir(destPath, { recursive: true });
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const sourceEntryPath = path.join(sourcePath, entry.name);
    const destEntryPath = path.join(destPath, entry.name);

    if (entry.isDirectory()) {
      await copyFolderRecursive(sourceEntryPath, destEntryPath);
    } else {
      await fs.copyFile(sourceEntryPath, destEntryPath);
    }
  }
}

ipcMain.handle("fs:copyFolder", async (_event, sourcePath: string, destPath: string) => {
  try {
    await copyFolderRecursive(sourcePath, destPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("fs:getFileStats", async (_event, filePath: string) => {
  try {
    const stats = await fs.stat(filePath);
    return {
      success: true,
      data: {
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
      },
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("fs:getHomeDirectory", () => {
  return { success: true, data: app.getPath("home") };
});

async function deleteFolderRecursive(folderPath: string): Promise<void> {
  const entries = await fs.readdir(folderPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(folderPath, entry.name);
    if (entry.isDirectory()) {
      await deleteFolderRecursive(fullPath);
    } else {
      await fs.unlink(fullPath);
    }
  }

  await fs.rmdir(folderPath);
}

ipcMain.handle("fs:deleteFile", async (_event, filePath: string) => {
  try {
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("fs:deleteFolder", async (_event, folderPath: string) => {
  try {
    await deleteFolderRecursive(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on("window-all-closed", () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== "darwin") {
    app.quit();
  }
});
