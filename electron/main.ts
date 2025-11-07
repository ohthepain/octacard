import { app, BrowserWindow, ipcMain } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const ffmpegStatic = require("ffmpeg-static");

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

// Function to get volume UUID/serial number
async function getVolumeUUID(volumePath: string): Promise<string | null> {
  try {
    if (process.platform === "darwin") {
      // macOS: Use diskutil to get UUID
      const volumeName = path.basename(volumePath);
      try {
        const { stdout } = await execAsync(`diskutil info "${volumeName}"`);
        // Look for Volume UUID or Disk / Partition UUID
        const uuidMatch = stdout.match(/Volume UUID:\s*([A-F0-9-]+)/i) || stdout.match(/Disk \/ Partition UUID:\s*([A-F0-9-]+)/i);
        if (uuidMatch && uuidMatch[1]) {
          return uuidMatch[1];
        }
        // Fallback: use volume name as identifier
        return volumeName;
      } catch {
        // Fallback: use volume name as identifier
        return volumeName;
      }
    } else if (process.platform === "linux") {
      // Linux: Use findmnt to get UUID
      try {
        const { stdout } = await execAsync(`findmnt -n -o UUID --target "${volumePath}"`);
        const uuid = stdout.trim();
        if (uuid && uuid !== "unknown") {
          return uuid;
        }
      } catch {
        // Fallback: use volume name
      }
      return path.basename(volumePath);
    } else if (process.platform === "win32") {
      // Windows: Use wmic to get volume serial number
      const drive = volumePath[0];
      try {
        const { stdout } = await execAsync(`wmic logicaldisk where "name='${drive}:'" get VolumeSerialNumber`);
        const serialMatch = stdout.match(/VolumeSerialNumber\s+([A-F0-9]+)/i);
        if (serialMatch && serialMatch[1]) {
          return serialMatch[1];
        }
      } catch {
        // Fallback: use drive letter
      }
      return drive;
    }
    return path.basename(volumePath);
  } catch (error) {
    console.error(`Error getting UUID for ${volumePath}:`, error);
    return path.basename(volumePath);
  }
}

// Function to get volume info (path and UUID)
async function getVolumeInfo(volumePath: string): Promise<{ path: string; uuid: string } | null> {
  const uuid = await getVolumeUUID(volumePath);
  if (!uuid) return null;
  return { path: volumePath, uuid };
}

// Function to detect SD/CF cards with volume info
async function detectSDCFCards(): Promise<Array<{ path: string; uuid: string }>> {
  const volumes = await getMountedVolumes();
  const cards: Array<{ path: string; uuid: string }> = [];

  for (const volume of volumes) {
    if (await isRemovableMedia(volume)) {
      const info = await getVolumeInfo(volume);
      if (info) {
        cards.push(info);
      }
    }
  }

  return cards;
}

// Poll for SD/CF card insertion
let lastDetectedCards: Array<{ path: string; uuid: string }> = [];
let pollInterval: NodeJS.Timeout | null = null;

async function pollForCards() {
  try {
    const cards = await detectSDCFCards();

    // Check for newly inserted cards (compare by UUID)
    const newCards = cards.filter((card) => !lastDetectedCards.some((lc) => lc.uuid === card.uuid));

    if (newCards.length > 0 && mainWindow) {
      console.log("SD/CF card detected:", newCards);
      // Send event to renderer with both path and UUID
      mainWindow.webContents.send("sd-card-detected", newCards[0].path, newCards[0].uuid);
    }

    // Check for removed cards (compare by UUID)
    const removedCards = lastDetectedCards.filter((lc) => !cards.some((card) => card.uuid === lc.uuid));
    if (removedCards.length > 0 && mainWindow) {
      console.log("SD/CF card removed:", removedCards);
      mainWindow.webContents.send("sd-card-removed", removedCards[0].path, removedCards[0].uuid);
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
    mainWindow.loadURL("http://localhost:5173");
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

// Helper function to check if a path is inside another path
function isPathInside(parentPath: string, childPath: string): boolean {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

async function copyFolderRecursive(sourcePath: string, destPath: string, rootSourcePath: string): Promise<void> {
  await fs.mkdir(destPath, { recursive: true });
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });

  for (const entry of entries) {
    const sourceEntryPath = path.join(sourcePath, entry.name);
    const destEntryPath = path.join(destPath, entry.name);

    // Skip if destination would be inside the source tree (prevents recursive copying)
    if (isPathInside(rootSourcePath, destEntryPath)) {
      continue;
    }

    if (entry.isDirectory()) {
      await copyFolderRecursive(sourceEntryPath, destEntryPath, rootSourcePath);
    } else {
      await fs.copyFile(sourceEntryPath, destEntryPath);
    }
  }
}

ipcMain.handle("fs:copyFolder", async (_event, sourcePath: string, destPath: string) => {
  try {
    // Check if destination is inside source (prevent copying folder into itself)
    if (isPathInside(sourcePath, destPath)) {
      return { success: false, error: "Cannot copy folder into itself or its subdirectories" };
    }

    await copyFolderRecursive(sourcePath, destPath, sourcePath);
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

ipcMain.handle("fs:getVolumeInfo", async (_event, volumePath: string) => {
  try {
    const info = await getVolumeInfo(volumePath);
    if (!info) {
      return { success: false, error: "Could not get volume info" };
    }
    return { success: true, data: info };
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

ipcMain.handle("fs:createFolder", async (_event, folderPath: string) => {
  try {
    await fs.mkdir(folderPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("fs:revealInFinder", async (_event, filePath: string) => {
  try {
    if (process.platform === "darwin") {
      // macOS: Use 'open -R' to reveal file in Finder
      await execAsync(`open -R "${filePath}"`);
    } else if (process.platform === "win32") {
      // Windows: Use explorer to select the file
      await execAsync(`explorer /select,"${filePath.replace(/\//g, "\\")}"`);
    } else {
      // Linux: Use xdg-open to open parent directory
      const parentDir = path.dirname(filePath);
      await execAsync(`xdg-open "${parentDir}"`);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle("fs:ejectVolume", async (_event, volumePath: string) => {
  try {
    if (process.platform === "darwin") {
      // macOS: Use diskutil to eject the volume
      const volumeName = path.basename(volumePath);
      // Use diskutil eject with the volume name
      await execAsync(`diskutil eject "${volumeName}"`);
      return { success: true };
    } else if (process.platform === "win32") {
      // Windows: Use PowerShell to eject the volume
      const drive = volumePath[0];
      await execAsync(`powershell -Command "(New-Object -comObject Shell.Application).Namespace(17).ParseName('${drive}:').InvokeVerb('Eject')"`);
      return { success: true };
    } else if (process.platform === "linux") {
      // Linux: Use umount to unmount the volume
      await execAsync(`umount "${volumePath}"`);
      return { success: true };
    }
    return { success: false, error: "Platform not supported" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Helper function to get ffmpeg path (use static binary if available, otherwise try system)
function getFFmpegPath(): string | null {
  if (ffmpegStatic) {
    return ffmpegStatic;
  }
  // Fallback to system ffmpeg
  return "ffmpeg";
}

// Helper function to check if ffmpeg is available
async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    const ffmpegPath = getFFmpegPath();
    if (!ffmpegPath) return false;
    await execAsync(`"${ffmpegPath}" -version`);
    return true;
  } catch {
    return false;
  }
}

// Helper function to get audio file sample rate using ffprobe
async function getAudioSampleRate(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execAsync(
      `ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    );
    const rate = parseFloat(stdout.trim());
    return isNaN(rate) ? null : rate;
  } catch {
    return null;
  }
}

ipcMain.handle(
  "fs:convertAndCopyFile",
  async (
    _event,
    sourcePath: string,
    destPath: string,
    targetSampleRate?: number,
    sampleDepth?: string,
    fileFormat?: string,
    mono?: boolean,
    normalize?: boolean
  ) => {
    try {
      // Ensure destination directory exists
      const destDir = path.dirname(destPath);
      await fs.mkdir(destDir, { recursive: true });

      // Check if ffmpeg is available
      const ffmpegAvailable = await checkFFmpegAvailable();
      if (!ffmpegAvailable) {
        // Fallback: just copy the file if ffmpeg is not available
        console.warn("ffmpeg not available, copying file without conversion");
        await fs.copyFile(sourcePath, destPath);
        return { success: true };
      }

      // Check if conversion is needed
      // If any conversion setting is enabled, we'll convert
      const needsConversion = targetSampleRate || sampleDepth === "16-bit" || mono || normalize || fileFormat === "WAV";
      if (!needsConversion) {
        await fs.copyFile(sourcePath, destPath);
        return { success: true };
      }

      // Get ffmpeg path
      const ffmpegPath = getFFmpegPath();
      if (!ffmpegPath) {
        console.warn("ffmpeg path not available, copying file without conversion");
        await fs.copyFile(sourcePath, destPath);
        return { success: true };
      }

      // Build ffmpeg command arguments
      const ffmpegArgs: string[] = [
        "-i",
        sourcePath,
        "-y", // Overwrite output file
      ];

      // Add sample rate conversion (always apply if targetSampleRate is set)
      if (targetSampleRate) {
        ffmpegArgs.push("-ar", targetSampleRate.toString());
      }

      // Add mono conversion
      if (mono) {
        ffmpegArgs.push("-ac", "1");
      }

      // Add normalization (loudnorm filter)
      if (normalize) {
        ffmpegArgs.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
      }

      // Determine audio codec based on sample depth
      let audioCodec = "pcm_s16le"; // Default to 16-bit
      if (sampleDepth === "16-bit") {
        audioCodec = "pcm_s16le";
      } else if (sampleDepth === "dont-change") {
        // Try to preserve original bit depth, but default to 16-bit for WAV
        audioCodec = "pcm_s16le";
      } else {
        // Default to 16-bit for compatibility
        audioCodec = "pcm_s16le";
      }

      // Ensure output is WAV format if fileFormat is WAV
      // If fileFormat is "dont-change" but we're converting for other reasons, also convert to WAV
      const destExt = path.extname(destPath).toLowerCase();
      let finalDestPath = destPath;
      if (fileFormat === "WAV") {
        // Change extension to .wav when fileFormat is explicitly set to WAV
        finalDestPath = destPath.replace(/\.\w+$/i, ".wav");
      } else if (destExt !== ".wav") {
        // If not WAV format specified but extension is not .wav, convert to WAV for compatibility
        finalDestPath = destPath.replace(/\.\w+$/i, ".wav");
      }

      // Add output format specification for WAV
      if (fileFormat === "WAV" || destExt !== ".wav") {
        ffmpegArgs.push("-f", "wav");
      }

      ffmpegArgs.push("-acodec", audioCodec, finalDestPath);

      // Escape paths with spaces for shell execution
      const escapedArgs = ffmpegArgs.map((arg) => {
        if (arg.includes(" ") || arg.includes('"')) {
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      });

      const command = `"${ffmpegPath}" ${escapedArgs.join(" ")}`;

      console.log("Running ffmpeg command:", command);
      await execAsync(command);

      // Update destPath if it was changed
      if (finalDestPath !== destPath) {
        destPath = finalDestPath;
      }

      return { success: true };
    } catch (error) {
      console.error("FFmpeg conversion error:", error);
      return { success: false, error: String(error) };
    }
  }
);

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

// Clean up polling interval and ensure clean exit
app.on("will-quit", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  // In development mode, force exit after cleanup to help debugger detach properly
  if (process.env.NODE_ENV === "development") {
    setTimeout(() => process.exit(0), 100);
  }
});

// Quit when all windows are closed
app.on("window-all-closed", () => {
  // Clean up polling interval
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  
  // On macOS, keep app running even when all windows are closed (unless debugging)
  // In debug mode, quit to allow debugger to detach properly
  if (process.platform !== "darwin" || process.env.NODE_ENV === "development") {
    app.quit();
  }
});

// Ensure clean exit when debugging
app.on("before-quit", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
});

// Handle process signals for clean shutdown
process.on("SIGINT", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  app.quit();
  // Force exit after a short delay to ensure clean shutdown
  setTimeout(() => process.exit(0), 100);
});

process.on("SIGTERM", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  app.quit();
  // Force exit after a short delay to ensure clean shutdown
  setTimeout(() => process.exit(0), 100);
});
