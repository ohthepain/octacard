// electron/main.ts
import { app, BrowserWindow, ipcMain, protocol } from "electron";
import * as path from "path";
import * as fs from "fs/promises";
import { exec } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import { createRequire } from "module";
var require2 = createRequire(import.meta.url);
var ffmpegStatic = require2("ffmpeg-static");
var execAsync = promisify(exec);
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
var mainWindow = null;
async function getMountedVolumes() {
  try {
    if (process.platform === "darwin") {
      const volumes = await fs.readdir("/Volumes");
      return volumes.map((vol) => `/Volumes/${vol}`);
    } else if (process.platform === "linux") {
      const volumes = [];
      try {
        const media = await fs.readdir("/media");
        volumes.push(...media.map((vol) => `/media/${vol}`));
      } catch {
      }
      try {
        const mnt = await fs.readdir("/mnt");
        volumes.push(...mnt.map((vol) => `/mnt/${vol}`));
      } catch {
      }
      return volumes;
    } else if (process.platform === "win32") {
      const { stdout } = await execAsync("wmic logicaldisk get name");
      const drives = stdout.split("\n").filter((line) => line.trim().match(/^[A-Z]:/)).map((line) => line.trim());
      return drives;
    }
    return [];
  } catch (error) {
    console.error("Error getting mounted volumes:", error);
    return [];
  }
}
async function isRemovableMedia(volumePath) {
  try {
    if (process.platform === "darwin") {
      const volumeName = path.basename(volumePath);
      try {
        const { stdout } = await execAsync(`diskutil info "${volumeName}"`);
        return stdout.includes("Removable Media:") || stdout.includes("External:") || stdout.includes("Removable: Yes") || volumeName.toLowerCase().includes("sd") || volumeName.toLowerCase().includes("cf");
      } catch {
        const name = volumeName.toLowerCase();
        return name.includes("sd") || name.includes("cf") || name.includes("card");
      }
    } else if (process.platform === "linux") {
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
            const name2 = volumeName.toLowerCase();
            return name2.includes("sd") || name2.includes("cf") || name2.includes("card");
          }
        }
      } catch {
      }
      const name = volumeName.toLowerCase();
      return name.includes("sd") || name.includes("cf") || name.includes("card");
    } else if (process.platform === "win32") {
      try {
        const drive = volumePath[0];
        const { stdout } = await execAsync(`wmic logicaldisk where "name='${drive}:'" get drivetype`);
        return stdout.includes("2");
      } catch {
        return false;
      }
    }
    return false;
  } catch (error) {
    console.error(`Error checking if ${volumePath} is removable:`, error);
    return false;
  }
}
async function getVolumeUUID(volumePath) {
  try {
    if (process.platform === "darwin") {
      const volumeName = path.basename(volumePath);
      try {
        const { stdout } = await execAsync(`diskutil info "${volumeName}"`);
        const uuidMatch = stdout.match(/Volume UUID:\s*([A-F0-9-]+)/i) || stdout.match(/Disk \/ Partition UUID:\s*([A-F0-9-]+)/i);
        if (uuidMatch && uuidMatch[1]) {
          return uuidMatch[1];
        }
        return volumeName;
      } catch {
        return volumeName;
      }
    } else if (process.platform === "linux") {
      try {
        const { stdout } = await execAsync(`findmnt -n -o UUID --target "${volumePath}"`);
        const uuid = stdout.trim();
        if (uuid && uuid !== "unknown") {
          return uuid;
        }
      } catch {
      }
      return path.basename(volumePath);
    } else if (process.platform === "win32") {
      const drive = volumePath[0];
      try {
        const { stdout } = await execAsync(`wmic logicaldisk where "name='${drive}:'" get VolumeSerialNumber`);
        const serialMatch = stdout.match(/VolumeSerialNumber\s+([A-F0-9]+)/i);
        if (serialMatch && serialMatch[1]) {
          return serialMatch[1];
        }
      } catch {
      }
      return drive;
    }
    return path.basename(volumePath);
  } catch (error) {
    console.error(`Error getting UUID for ${volumePath}:`, error);
    return path.basename(volumePath);
  }
}
async function getVolumeInfo(volumePath) {
  const uuid = await getVolumeUUID(volumePath);
  if (!uuid) return null;
  return { path: volumePath, uuid };
}
async function detectSDCFCards() {
  const volumes = await getMountedVolumes();
  const cards = [];
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
var lastDetectedCards = [];
var pollInterval = null;
async function pollForCards() {
  try {
    const cards = await detectSDCFCards();
    const newCards = cards.filter((card) => !lastDetectedCards.some((lc) => lc.uuid === card.uuid));
    if (newCards.length > 0 && mainWindow) {
      console.log("SD/CF card detected:", newCards);
      mainWindow.webContents.send("sd-card-detected", newCards[0].path, newCards[0].uuid);
    }
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
var createWindow = () => {
  const preloadPath = path.join(__dirname, "preload.js");
  console.log("Loading preload script from:", preloadPath);
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false
      // Disable web security to allow file:// URLs and custom protocols
    },
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default"
  });
  fs.access(preloadPath).then(() => console.log("\u2713 Preload script exists")).catch(() => console.error("\u2717 Preload script NOT found at:", preloadPath));
  if (isDev) {
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/index.html"));
  }
};
ipcMain.handle("fs:readDirectory", async (_event, dirPath) => {
  try {
    const realPath = await fs.realpath(dirPath);
    const entries = await fs.readdir(realPath, { withFileTypes: true });
    const result = await Promise.all(
      entries.map(async (entry) => {
        const fullPath = path.join(realPath, entry.name);
        const stats = await fs.stat(fullPath);
        return {
          name: entry.name,
          path: fullPath,
          type: entry.isDirectory() ? "folder" : "file",
          size: stats.size,
          isDirectory: entry.isDirectory()
        };
      })
    );
    return { success: true, data: result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:searchFiles", async (_event, query, searchPath) => {
  try {
    if (process.platform !== "darwin") {
      return { success: false, error: "mdfind is only available on macOS" };
    }
    const searchPattern = query.trim();
    console.log("searchFiles - original query:", query, "trimmed:", searchPattern);
    let spotlightQuery;
    if (searchPattern.startsWith(".")) {
      const ext = searchPattern.substring(1);
      console.log("searchFiles - extension search, ext:", ext);
      const escapedExt = ext.replace(/'/g, "\\'");
      spotlightQuery = `kMDItemFSName == '*.${escapedExt}'c`;
    } else {
      const escapedPattern = searchPattern.replace(/'/g, "\\'");
      spotlightQuery = `kMDItemFSName == '*${escapedPattern}*'c`;
    }
    console.log("searchFiles - spotlight query:", spotlightQuery);
    let command;
    if (searchPath) {
      const escapedPath = searchPath.replace(/["\\]/g, "\\$&");
      command = `mdfind -onlyin "${escapedPath}" "${spotlightQuery}"`;
    } else {
      command = `mdfind "${spotlightQuery}"`;
    }
    console.log("mdfind command:", command);
    const { stdout, stderr } = await execAsync(command, { maxBuffer: 10 * 1024 * 1024 });
    if (stderr && !stderr.includes("mdfind:")) {
      console.warn("mdfind stderr:", stderr);
    }
    const filePaths = stdout.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    console.log("searchFiles - mdfind returned", filePaths.length, "file paths");
    const results = await Promise.all(
      filePaths.map(async (filePath) => {
        try {
          const stats = await fs.stat(filePath);
          return {
            name: path.basename(filePath),
            path: filePath,
            type: stats.isDirectory() ? "folder" : "file",
            size: stats.size,
            isDirectory: stats.isDirectory()
          };
        } catch (error) {
          return null;
        }
      })
    );
    const filteredResults = results.filter(
      (result) => result && !result.name.startsWith(".") && !result.name.startsWith("~")
    );
    console.log("searchFiles - filtered results:", filteredResults.length);
    return { success: true, data: filteredResults };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:copyFile", async (_event, sourcePath, destPath) => {
  try {
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });
    await fs.copyFile(sourcePath, destPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
function isPathInside(parentPath, childPath) {
  const parent = path.resolve(parentPath);
  const child = path.resolve(childPath);
  const relative2 = path.relative(parent, child);
  return relative2 !== "" && !relative2.startsWith("..") && !path.isAbsolute(relative2);
}
async function copyFolderRecursive(sourcePath, destPath, rootSourcePath) {
  await fs.mkdir(destPath, { recursive: true });
  const entries = await fs.readdir(sourcePath, { withFileTypes: true });
  for (const entry of entries) {
    const sourceEntryPath = path.join(sourcePath, entry.name);
    const destEntryPath = path.join(destPath, entry.name);
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
ipcMain.handle("fs:copyFolder", async (_event, sourcePath, destPath) => {
  try {
    if (isPathInside(sourcePath, destPath)) {
      return { success: false, error: "Cannot copy folder into itself or its subdirectories" };
    }
    await copyFolderRecursive(sourcePath, destPath, sourcePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:getFileStats", async (_event, filePath) => {
  try {
    const realPath = await fs.realpath(filePath);
    const stats = await fs.stat(realPath);
    return {
      success: true,
      data: {
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile()
      }
    };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:getHomeDirectory", () => {
  return { success: true, data: app.getPath("home") };
});
ipcMain.handle("fs:getAvailableVolumes", async () => {
  try {
    const volumeEntries = [];
    const seenPaths = /* @__PURE__ */ new Set();
    const normalizePath = (inputPath) => {
      if (process.platform === "win32") {
        return inputPath.replace(/\\+/g, "\\").toLowerCase();
      }
      if (inputPath === "/") {
        return "/";
      }
      return inputPath.replace(/\/+$/, "");
    };
    const homePath = app.getPath("home");
    const normalizedHome = normalizePath(homePath);
    seenPaths.add(normalizedHome);
    volumeEntries.push({
      path: homePath,
      uuid: await getVolumeUUID(homePath),
      name: "Local Files",
      isRemovable: false,
      isHome: true
    });
    const mountedVolumes = await getMountedVolumes();
    for (const rawVolumePath of mountedVolumes) {
      if (!rawVolumePath) continue;
      const normalizedVolume = normalizePath(rawVolumePath);
      if (!normalizedVolume || seenPaths.has(normalizedVolume)) {
        continue;
      }
      try {
        const stats = await fs.stat(rawVolumePath);
        if (!stats.isDirectory()) {
          continue;
        }
      } catch {
        continue;
      }
      const volumeName = path.basename(rawVolumePath) || rawVolumePath;
      if (volumeName.startsWith(".")) {
        continue;
      }
      const uuid = await getVolumeUUID(rawVolumePath);
      const removable = await isRemovableMedia(rawVolumePath);
      volumeEntries.push({
        path: rawVolumePath,
        uuid,
        name: volumeName,
        isRemovable: removable,
        isHome: false
      });
      seenPaths.add(normalizedVolume);
    }
    volumeEntries.sort((a, b) => {
      if (a.isHome) return -1;
      if (b.isHome) return 1;
      return a.name.localeCompare(b.name);
    });
    return { success: true, data: volumeEntries };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:getSDCFCards", async () => {
  try {
    const cards = await detectSDCFCards();
    return { success: true, data: cards };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:getVolumeInfo", async (_event, volumePath) => {
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
async function deleteFolderRecursive(folderPath) {
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
ipcMain.handle("fs:deleteFile", async (_event, filePath) => {
  try {
    await fs.unlink(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:deleteFolder", async (_event, folderPath) => {
  try {
    await deleteFolderRecursive(folderPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:createFolder", async (_event, folderPath) => {
  try {
    await fs.mkdir(folderPath, { recursive: true });
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:revealInFinder", async (_event, filePath) => {
  try {
    if (process.platform === "darwin") {
      await execAsync(`open -R "${filePath}"`);
    } else if (process.platform === "win32") {
      await execAsync(`explorer /select,"${filePath.replace(/\//g, "\\")}"`);
    } else {
      const parentDir = path.dirname(filePath);
      await execAsync(`xdg-open "${parentDir}"`);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:ejectVolume", async (_event, volumePath) => {
  try {
    if (process.platform === "darwin") {
      const volumeName = path.basename(volumePath);
      await execAsync(`diskutil eject "${volumeName}"`);
      return { success: true };
    } else if (process.platform === "win32") {
      const drive = volumePath[0];
      await execAsync(
        `powershell -Command "(New-Object -comObject Shell.Application).Namespace(17).ParseName('${drive}:').InvokeVerb('Eject')"`
      );
      return { success: true };
    } else if (process.platform === "linux") {
      await execAsync(`umount "${volumePath}"`);
      return { success: true };
    }
    return { success: false, error: "Platform not supported" };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:getAudioFileUrl", async (_event, filePath) => {
  try {
    try {
      await fs.access(filePath);
    } catch (accessError) {
      console.error("getAudioFileUrl - file does not exist:", filePath, accessError);
      return { success: false, error: `File not found: ${filePath}` };
    }
    const encodedPath = encodeURIComponent(filePath);
    const url = `octacard-audio://${encodedPath.startsWith("%2F") ? "/" : ""}${encodedPath}`;
    console.log("getAudioFileUrl - file exists, returning URL:", url, "for path:", filePath);
    return { success: true, data: url };
  } catch (error) {
    console.error("getAudioFileUrl - error:", error, "for path:", filePath);
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:getAudioFileBlob", async (_event, filePath) => {
  try {
    let fileSize = 0;
    try {
      const stats = await fs.stat(filePath);
      fileSize = stats.size;
    } catch (accessError) {
      console.error("getAudioFileBlob - file does not exist:", filePath, accessError);
      return { success: false, error: `File not found: ${filePath}` };
    }
    const fileSizeMB = fileSize / (1024 * 1024);
    if (fileSizeMB > 200) {
      console.warn(`getAudioFileBlob - Large file detected: ${fileSizeMB.toFixed(1)}MB. This may take a while...`);
    }
    console.log("getAudioFileBlob - Reading file:", filePath, `(${fileSizeMB.toFixed(1)}MB)`);
    const fileBuffer = await fs.readFile(filePath);
    console.log("getAudioFileBlob - File read complete, converting to base64...");
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".wav": "audio/wav",
      ".aiff": "audio/aiff",
      ".aif": "audio/aiff",
      ".mp3": "audio/mpeg",
      ".flac": "audio/flac",
      ".ogg": "audio/ogg",
      ".m4a": "audio/mp4",
      ".aac": "audio/aac",
      ".wma": "audio/x-ms-wma"
    };
    const mimeType = mimeTypes[ext] || "audio/mpeg";
    const base64 = fileBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;
    console.log("getAudioFileBlob - returning blob data URL for:", filePath);
    return { success: true, data: dataUrl };
  } catch (error) {
    console.error("getAudioFileBlob - error:", error, "for path:", filePath);
    if (String(error).includes("ETIMEDOUT") || String(error).includes("timeout")) {
      return { success: false, error: `File read timeout. The file may be too large or inaccessible.` };
    }
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:getVideoFileUrl", async (_event, filePath) => {
  try {
    try {
      await fs.access(filePath);
    } catch (accessError) {
      console.error("getVideoFileUrl - file does not exist:", filePath, accessError);
      return { success: false, error: `File not found: ${filePath}` };
    }
    const encodedPath = encodeURIComponent(filePath);
    const url = `octacard-video://${encodedPath}`;
    console.log("getVideoFileUrl - file exists, returning custom protocol URL:", url, "for path:", filePath);
    return { success: true, data: url };
  } catch (error) {
    console.error("getVideoFileUrl - error:", error, "for path:", filePath);
    return { success: false, error: String(error) };
  }
});
ipcMain.handle("fs:getVideoFileBlob", async (_event, filePath) => {
  try {
    let fileSize = 0;
    try {
      const stats = await fs.stat(filePath);
      fileSize = stats.size;
    } catch (accessError) {
      console.error("getVideoFileBlob - file does not exist:", filePath, accessError);
      return { success: false, error: `File not found: ${filePath}` };
    }
    const fileSizeMB = fileSize / (1024 * 1024);
    if (fileSizeMB > 500) {
      console.warn(`getVideoFileBlob - Large file detected: ${fileSizeMB.toFixed(1)}MB. This may take a while...`);
    }
    console.log("getVideoFileBlob - Reading file:", filePath, `(${fileSizeMB.toFixed(1)}MB)`);
    const fileBuffer = await fs.readFile(filePath);
    console.log("getVideoFileBlob - File read complete, converting to base64...");
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".mkv": "video/x-matroska",
      ".webm": "video/webm",
      ".m4v": "video/x-m4v",
      ".flv": "video/x-flv",
      ".wmv": "video/x-ms-wmv",
      ".3gp": "video/3gpp",
      ".ogv": "video/ogg"
    };
    const mimeType = mimeTypes[ext] || "video/mp4";
    const base64 = fileBuffer.toString("base64");
    const dataUrl = `data:${mimeType};base64,${base64}`;
    console.log("getVideoFileBlob - returning blob data URL for:", filePath);
    return { success: true, data: dataUrl };
  } catch (error) {
    console.error("getVideoFileBlob - error:", error, "for path:", filePath);
    if (String(error).includes("ETIMEDOUT") || String(error).includes("timeout")) {
      return { success: false, error: `File read timeout. The file may be too large or inaccessible.` };
    }
    return { success: false, error: String(error) };
  }
});
function getFFmpegPath() {
  if (ffmpegStatic) {
    return ffmpegStatic;
  }
  return "ffmpeg";
}
async function checkFFmpegAvailable() {
  try {
    const ffmpegPath = getFFmpegPath();
    if (!ffmpegPath) return false;
    await execAsync(`"${ffmpegPath}" -version`);
    return true;
  } catch {
    return false;
  }
}
ipcMain.handle(
  "fs:convertAndCopyFile",
  async (_event, sourcePath, destPath, targetSampleRate, sampleDepth, fileFormat, mono, normalize2) => {
    try {
      const destDir = path.dirname(destPath);
      await fs.mkdir(destDir, { recursive: true });
      const ffmpegAvailable = await checkFFmpegAvailable();
      if (!ffmpegAvailable) {
        console.warn("ffmpeg not available, copying file without conversion");
        await fs.copyFile(sourcePath, destPath);
        return { success: true };
      }
      const needsConversion = targetSampleRate || sampleDepth === "16-bit" || mono || normalize2 || fileFormat === "WAV";
      if (!needsConversion) {
        await fs.copyFile(sourcePath, destPath);
        return { success: true };
      }
      const ffmpegPath = getFFmpegPath();
      if (!ffmpegPath) {
        console.warn("ffmpeg path not available, copying file without conversion");
        await fs.copyFile(sourcePath, destPath);
        return { success: true };
      }
      const ffmpegArgs = [
        "-i",
        sourcePath,
        "-y"
        // Overwrite output file
      ];
      if (targetSampleRate) {
        ffmpegArgs.push("-ar", targetSampleRate.toString());
      }
      if (mono) {
        ffmpegArgs.push("-ac", "1");
      }
      if (normalize2) {
        ffmpegArgs.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
      }
      let audioCodec = "pcm_s16le";
      if (sampleDepth === "16-bit") {
        audioCodec = "pcm_s16le";
      } else if (sampleDepth === "dont-change") {
        audioCodec = "pcm_s16le";
      } else {
        audioCodec = "pcm_s16le";
      }
      const destExt = path.extname(destPath).toLowerCase();
      let finalDestPath = destPath;
      if (fileFormat === "WAV") {
        finalDestPath = destPath.replace(/\.\w+$/i, ".wav");
      } else if (destExt !== ".wav") {
        finalDestPath = destPath.replace(/\.\w+$/i, ".wav");
      }
      if (fileFormat === "WAV" || destExt !== ".wav") {
        ffmpegArgs.push("-f", "wav");
      }
      ffmpegArgs.push("-acodec", audioCodec, finalDestPath);
      const escapedArgs = ffmpegArgs.map((arg) => {
        if (arg.includes(" ") || arg.includes('"')) {
          return `"${arg.replace(/"/g, '\\"')}"`;
        }
        return arg;
      });
      const command = `"${ffmpegPath}" ${escapedArgs.join(" ")}`;
      console.log("Running ffmpeg command:", command);
      await execAsync(command);
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
app.whenReady().then(() => {
  function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".wav": "audio/wav",
      ".aiff": "audio/aiff",
      ".aif": "audio/aiff",
      ".mp3": "audio/mpeg",
      ".flac": "audio/flac",
      ".ogg": "audio/ogg",
      ".m4a": "audio/mp4",
      ".aac": "audio/aac",
      ".wma": "audio/x-ms-wma"
    };
    return mimeTypes[ext] || "audio/mpeg";
  }
  function getVideoMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = {
      ".mp4": "video/mp4",
      ".mov": "video/quicktime",
      ".avi": "video/x-msvideo",
      ".mkv": "video/x-matroska",
      ".webm": "video/webm",
      ".m4v": "video/x-m4v",
      ".flv": "video/x-flv",
      ".wmv": "video/x-ms-wmv",
      ".3gp": "video/3gpp",
      ".ogv": "video/ogg"
    };
    return mimeTypes[ext] || "video/mp4";
  }
  protocol.handle("octacard-audio", async (request) => {
    try {
      const url = new URL(request.url);
      console.log("Protocol handler - request URL:", request.url);
      console.log("Protocol handler - URL pathname:", url.pathname);
      let encodedPath = url.pathname;
      if (encodedPath.startsWith("/")) {
        encodedPath = encodedPath.slice(1);
      }
      let filePath;
      try {
        filePath = decodeURIComponent(encodedPath);
      } catch (decodeError) {
        console.error("Protocol handler - decode error:", decodeError, "encoded path:", encodedPath);
        return new Response(null, { status: 404 });
      }
      filePath = path.normalize(filePath);
      console.log("Protocol handler - decoded and normalized file path:", filePath);
      try {
        await fs.access(filePath);
      } catch (accessError) {
        console.error("Protocol handler - file access error:", accessError);
        console.error("Protocol handler - attempted path:", filePath);
        return new Response(null, { status: 404 });
      }
      try {
        const fileBuffer = await fs.readFile(filePath);
        const mimeType = getMimeType(filePath);
        console.log("Protocol handler - file exists, serving:", filePath, "MIME type:", mimeType);
        return new Response(fileBuffer, {
          headers: {
            "Content-Type": mimeType
          }
        });
      } catch (readError) {
        console.error("Protocol handler - file read error:", readError);
        return new Response(null, { status: 404 });
      }
    } catch (error) {
      console.error("Protocol handler - error:", error, "request URL:", request.url);
      return new Response(null, { status: 404 });
    }
  });
  protocol.handle("octacard-video", async (request) => {
    try {
      const url = new URL(request.url);
      console.log("Video protocol handler - request URL:", request.url);
      console.log("Video protocol handler - URL parts:", {
        protocol: url.protocol,
        hostname: url.hostname,
        pathname: url.pathname,
        href: url.href
      });
      let encodedPath = url.pathname || url.hostname || "";
      if (encodedPath.startsWith("/")) {
        encodedPath = encodedPath.slice(1);
      }
      if (!encodedPath) {
        console.error("Video protocol handler - no encoded path found in URL");
        return new Response(null, { status: 404 });
      }
      let filePath;
      try {
        filePath = decodeURIComponent(encodedPath);
        console.log("Video protocol handler - decoded path:", filePath);
      } catch (decodeError) {
        console.error("Video protocol handler - decode error:", decodeError, "encoded path:", encodedPath);
        return new Response(null, { status: 404 });
      }
      filePath = path.normalize(filePath);
      console.log("Video protocol handler - decoded file path:", filePath);
      let stats;
      try {
        stats = await fs.stat(filePath);
      } catch (accessError) {
        console.error("Video protocol handler - file access error:", accessError);
        return new Response(null, { status: 404 });
      }
      const fileSize = stats.size;
      const mimeType = getVideoMimeType(filePath);
      const rangeHeader = request.headers.get("range");
      if (rangeHeader) {
        const rangeMatch = rangeHeader.match(/bytes=(\d+)-(\d*)/);
        if (rangeMatch) {
          const start = parseInt(rangeMatch[1], 10);
          const end = rangeMatch[2] ? parseInt(rangeMatch[2], 10) : fileSize - 1;
          if (start < 0 || start >= fileSize || end < start || end >= fileSize) {
            console.error(`Video protocol handler - invalid range: ${start}-${end}, file size: ${fileSize}`);
            return new Response(null, {
              status: 416,
              headers: {
                "Content-Range": `bytes */${fileSize}`
              }
            });
          }
          const chunkSize = end - start + 1;
          console.log(
            `Video protocol handler - range request: ${start}-${end} (${chunkSize} bytes) of ${fileSize} total`
          );
          try {
            const fileHandle = await fs.open(filePath, "r");
            const buffer = Buffer.alloc(chunkSize);
            const { bytesRead } = await fileHandle.read(buffer, 0, chunkSize, start);
            await fileHandle.close();
            const actualBuffer = bytesRead < chunkSize ? buffer.subarray(0, bytesRead) : buffer;
            const actualEnd = start + bytesRead - 1;
            console.log(`Video protocol handler - read ${bytesRead} bytes, returning range ${start}-${actualEnd}`);
            return new Response(actualBuffer, {
              status: 206,
              // Partial Content
              headers: {
                "Content-Type": mimeType,
                "Content-Range": `bytes ${start}-${actualEnd}/${fileSize}`,
                "Accept-Ranges": "bytes",
                "Content-Length": bytesRead.toString()
              }
            });
          } catch (readError) {
            console.error("Video protocol handler - range read error:", readError);
            return new Response(null, {
              status: 416,
              headers: {
                "Content-Range": `bytes */${fileSize}`
              }
            });
          }
        } else {
          console.error("Video protocol handler - invalid range header format:", rangeHeader);
        }
      }
      console.log(
        "Video protocol handler - serving full file:",
        filePath,
        "MIME type:",
        mimeType,
        `(${(fileSize / (1024 * 1024)).toFixed(1)}MB)`
      );
      try {
        const fileBuffer = await fs.readFile(filePath);
        return new Response(fileBuffer, {
          headers: {
            "Content-Type": mimeType,
            "Accept-Ranges": "bytes",
            "Content-Length": fileSize.toString()
          }
        });
      } catch (readError) {
        console.error("Video protocol handler - file read error:", readError);
        return new Response(null, { status: 404 });
      }
    } catch (error) {
      console.error("Video protocol handler - error:", error, "request URL:", request.url);
      return new Response(null, { status: 404 });
    }
  });
  console.log("Custom protocols 'octacard-audio' and 'octacard-video' registered");
  createWindow();
  pollInterval = setInterval(pollForCards, 2e3);
  pollForCards();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});
app.on("will-quit", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (process.env.NODE_ENV === "development") {
    setTimeout(() => process.exit(0), 100);
  }
});
app.on("window-all-closed", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  if (process.platform !== "darwin" || process.env.NODE_ENV === "development") {
    app.quit();
  }
});
app.on("before-quit", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
});
process.on("SIGINT", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  app.quit();
  setTimeout(() => process.exit(0), 100);
});
process.on("SIGTERM", () => {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
  app.quit();
  setTimeout(() => process.exit(0), 100);
});
//# sourceMappingURL=main.js.map
