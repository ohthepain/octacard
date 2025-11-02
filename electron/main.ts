import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";

const execAsync = promisify(exec);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development" || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

// Function to get mounted volumes (macOS and Linux)
async function getMountedVolumes(): Promise<string[]> {
  try {
    if (process.platform === "darwin") {
      // macOS: Check /Volumes directory
      const volumes = await fs.readdir("/Volumes");
      return volumes.map((vol) => `/Volumes/${vol}`);
    } else if (process.platform === "linux") {
      // Linux: Check /media and /mnt
      const volumes: string[] = [];
      try {
        const media = await fs.readdir("/media");
        volumes.push(...media.map((vol) => `/media/${vol}`));
      } catch {
        // /media may not exist or be accessible
      }
      try {
        const mnt = await fs.readdir("/mnt");
        volumes.push(...mnt.map((vol) => `/mnt/${vol}`));
      } catch {
        // /mnt may not exist or be accessible
      }
      return volumes;
    } else if (process.platform === "win32") {
      // Windows: Get drive letters
      const { stdout } = await execAsync("wmic logicaldisk get name");
      const drives = stdout
        .split("\n")
        .filter((line) => line.trim().match(/^[A-Z]:/))
        .map((line) => line.trim());
      return drives;
    }
    return [];
  } catch (error) {
    console.error("Error getting mounted volumes:", error);
    return [];
  }
}

// Function to detect if a volume is removable (SD/CF card)
async function isRemovableMedia(volumePath: string): Promise<boolean> {
  try {
    if (process.platform === "darwin") {
      // macOS: Use diskutil to check if it's removable
      const volumeName = path.basename(volumePath);
      try {
        const { stdout } = await execAsync(`diskutil info "${volumeName}"`);
        // Check if it's removable or external
        return (
          stdout.includes("Removable Media:") ||
          stdout.includes("External:") ||
          stdout.includes("Removable: Yes") ||
          volumeName.toLowerCase().includes("sd") ||
          volumeName.toLowerCase().includes("cf")
        );
      } catch {
        // If diskutil fails, check common SD/CF card names
        const name = volumeName.toLowerCase();
        return name.includes("sd") || name.includes("cf") || name.includes("card");
      }
    } else if (process.platform === "linux") {
      // Linux: Check sysfs for removable flag
      const volumeName = path.basename(volumePath);
      try {
        const { stdout } = await execAsync(`findmnt -n -o SOURCE --target "${volumePath}"`);
        const device = stdout.trim();
        if (device) {
          const deviceName = path.basename(device);
          const removablePath = `/sys/block/${deviceName}/removable`;
          try {
            const removable = await fs.readFile(removablePath, "utf-8");
            return removable.trim() === "1";
          } catch {
            // Fallback to name checking
            const name = volumeName.toLowerCase();
            return name.includes("sd") || name.includes("cf") || name.includes("card");
          }
        }
      } catch {
        // findmnt may not be available or volume may not be mounted
      }
      // Fallback: check if name suggests SD/CF card
      const name = volumeName.toLowerCase();
      return name.includes("sd") || name.includes("cf") || name.includes("card");
    } else if (process.platform === "win32") {
      // Windows: Check drive type
      try {
        const drive = volumePath[0];
        const { stdout } = await execAsync(`wmic logicaldisk where "name='${drive}:'" get drivetype`);
        // Drive type 2 = Removable
        return stdout.includes("2");
      } catch {
        // wmic may not be available or drive may not exist
        return false;
      }
    }
    return false;
  } catch (error) {
    console.error(`Error checking if ${volumePath} is removable:`, error);
    return false;
  }
}

// Function to detect SD/CF cards
async function detectSDCFCards(): Promise<string[]> {
  const volumes = await getMountedVolumes();
  const cards: string[] = [];

  for (const volume of volumes) {
    if (await isRemovableMedia(volume)) {
      cards.push(volume);
    }
  }

  return cards;
}

// Poll for SD/CF card insertion
let lastDetectedCards: string[] = [];
let pollInterval: NodeJS.Timeout | null = null;

async function pollForCards() {
  try {
    const cards = await detectSDCFCards();

    // Check for newly inserted cards
    const newCards = cards.filter((card) => !lastDetectedCards.includes(card));

    if (newCards.length > 0 && mainWindow) {
      console.log("SD/CF card detected:", newCards);
      // Send event to renderer
      mainWindow.webContents.send("sd-card-detected", newCards[0]);
    }

    // Check for removed cards
    const removedCards = lastDetectedCards.filter((card) => !cards.includes(card));
    if (removedCards.length > 0 && mainWindow) {
      console.log("SD/CF card removed:", removedCards);
      mainWindow.webContents.send("sd-card-removed", removedCards[0]);
    }

    lastDetectedCards = cards;
  } catch (error) {
    console.error("Error polling for cards:", error);
  }
}

const createWindow = () => {
  // Create the browser window
  const preloadPath = path.join(__dirname, "preload.js");
  console.log("Loading preload script from:", preloadPath);

  mainWindow = new BrowserWindow({
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

ipcMain.handle("fs:getSDCFCards", async () => {
  try {
    const cards = await detectSDCFCards();
    return { success: true, data: cards };
  } catch (error) {
    return { success: false, error: String(error) };
  }
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

  // Start polling for SD/CF cards every 2 seconds
  pollInterval = setInterval(pollForCards, 2000);
  // Initial check
  pollForCards();

  app.on("activate", () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Clean up polling interval on app quit
app.on("will-quit", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
  }
});

// Quit when all windows are closed
app.on("window-all-closed", () => {
  // On macOS, keep app running even when all windows are closed
  if (process.platform !== "darwin") {
    app.quit();
  }
});
