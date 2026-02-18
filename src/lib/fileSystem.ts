// Web-based file system API wrapper
// Uses File System Access API (showDirectoryPicker) for folder selection in the browser

export interface FileSystemEntry {
  name: string;
  path: string;
  type: "file" | "folder";
  size: number;
  isDirectory: boolean;
  birthtime?: number;
  mtime?: number;
  atime?: number;
}

export interface FileSystemResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

// Handle Registry to manage FileSystemDirectoryHandle instances
class HandleRegistry {
  private rootHandle: FileSystemDirectoryHandle | null = null;
  private handles: Map<string, FileSystemDirectoryHandle> = new Map();
  private handleToPath: Map<FileSystemDirectoryHandle, string> = new Map();

  async setRoot(handle: FileSystemDirectoryHandle): Promise<void> {
    this.rootHandle = handle;
    this.handles.set("/", handle);
    this.handleToPath.set(handle, "/");
  }

  getRoot(): FileSystemDirectoryHandle | null {
    return this.rootHandle;
  }

  hasRoot(): boolean {
    return this.rootHandle !== null;
  }

  async getDirectoryHandle(virtualPath: string): Promise<FileSystemDirectoryHandle> {
    if (!this.rootHandle) {
      throw new Error("No root directory handle set");
    }

    // Normalize path
    const normalizedPath = this.normalizePath(virtualPath);
    
    // Check cache
    if (this.handles.has(normalizedPath)) {
      return this.handles.get(normalizedPath)!;
    }

    // Navigate from root
    const parts = normalizedPath.split("/").filter(Boolean);
    let currentHandle = this.rootHandle;

    for (const part of parts) {
      currentHandle = await currentHandle.getDirectoryHandle(part);
    }

    // Cache the handle
    this.handles.set(normalizedPath, currentHandle);
    this.handleToPath.set(currentHandle, normalizedPath);

    return currentHandle;
  }

  /** Ensure directory path exists, creating any missing segments */
  async ensureDirectory(virtualPath: string): Promise<FileSystemDirectoryHandle> {
    if (!this.rootHandle) {
      throw new Error("No root directory handle set");
    }

    const normalizedPath = this.normalizePath(virtualPath);
    if (this.handles.has(normalizedPath)) {
      return this.handles.get(normalizedPath)!;
    }

    const parts = normalizedPath.split("/").filter(Boolean);
    let currentHandle = this.rootHandle;
    let currentPath = "/";

    for (const part of parts) {
      currentPath = currentPath === "/" ? `/${part}` : `${currentPath}/${part}`;
      if (this.handles.has(currentPath)) {
        currentHandle = this.handles.get(currentPath)!;
      } else {
        currentHandle = await currentHandle.getDirectoryHandle(part, { create: true });
        this.handles.set(currentPath, currentHandle);
        this.handleToPath.set(currentHandle, currentPath);
      }
    }

    return currentHandle;
  }

  async getFileHandle(virtualPath: string): Promise<FileSystemFileHandle> {
    if (!this.rootHandle) {
      throw new Error("No root directory handle set");
    }

    const normalizedPath = this.normalizePath(virtualPath);
    const parts = normalizedPath.split("/").filter(Boolean);
    
    if (parts.length === 0) {
      throw new Error("Invalid file path");
    }

    const fileName = parts.pop()!;
    const dirPath = "/" + parts.join("/");

    const dirHandle = await this.getDirectoryHandle(dirPath);
    return await dirHandle.getFileHandle(fileName);
  }

  getVirtualPath(handle: FileSystemDirectoryHandle): string | null {
    return this.handleToPath.get(handle) || null;
  }

  private normalizePath(path: string): string {
    // Remove leading/trailing slashes and normalize
    const parts = path.split("/").filter(Boolean);
    return "/" + parts.join("/");
  }

  clear(): void {
    this.rootHandle = null;
    this.handles.clear();
    this.handleToPath.clear();
  }
}

export type PaneType = "source" | "dest";

// File System Access API wrapper - supports per-pane roots for source and dest
class FileSystemService {
  private sourceRegistry = new HandleRegistry();
  private destRegistry = new HandleRegistry();

  private getRegistry(paneType: PaneType): HandleRegistry {
    return paneType === "source" ? this.sourceRegistry : this.destRegistry;
  }

  /** Request root directory - sets BOTH source and dest to the same folder (for initial setup) */
  async requestRootDirectory(): Promise<FileSystemResult<FileSystemDirectoryHandle>> {
    if (!('showDirectoryPicker' in window)) {
      return {
        success: false,
        error: 'File System Access API not supported in this browser',
      };
    }

    try {
      const handle = await (window as any).showDirectoryPicker();
      await this.sourceRegistry.setRoot(handle);
      await this.destRegistry.setRoot(handle);
      return {
        success: true,
        data: handle,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'User cancelled directory selection',
        };
      }
      return {
        success: false,
        error: String(error),
      };
    }
  }

  /** Request directory for a specific pane - only that pane navigates to the selected folder */
  async requestDirectoryForPane(paneType: PaneType): Promise<FileSystemResult<FileSystemDirectoryHandle>> {
    if (!('showDirectoryPicker' in window)) {
      return {
        success: false,
        error: 'File System Access API not supported in this browser',
      };
    }

    try {
      const handle = await (window as any).showDirectoryPicker();
      await this.getRegistry(paneType).setRoot(handle);
      return {
        success: true,
        data: handle,
      };
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return {
          success: false,
          error: 'User cancelled directory selection',
        };
      }
      return {
        success: false,
        error: String(error),
      };
    }
  }

  hasRootDirectory(): boolean {
    return this.sourceRegistry.hasRoot() || this.destRegistry.hasRoot();
  }

  hasRootForPane(paneType: PaneType): boolean {
    return this.getRegistry(paneType).hasRoot();
  }

  getRootDirectoryName(paneType?: PaneType): string {
    if (paneType) {
      return this.getRegistry(paneType).getRoot()?.name || "Selected Directory";
    }
    return this.sourceRegistry.getRoot()?.name || this.destRegistry.getRoot()?.name || "Selected Directory";
  }

  /** Get virtual path for a directory handle (if it's under our root and we've seen it) */
  getVirtualPath(handle: FileSystemDirectoryHandle, paneType?: PaneType): string | null {
    if (paneType) {
      return this.getRegistry(paneType).getVirtualPath(handle);
    }
    return this.sourceRegistry.getVirtualPath(handle) ?? this.destRegistry.getVirtualPath(handle);
  }

  // In the web app, "home" is the root of the user-selected directory.
  async getHomeDirectory(paneType: PaneType = "source"): Promise<FileSystemResult<string>> {
    if (!this.getRegistry(paneType).hasRoot()) {
      return { success: false, error: "No root directory selected" };
    }
    return { success: true, data: "/" };
  }

  async readDirectory(virtualPath: string, paneType: PaneType = "source"): Promise<FileSystemResult<FileSystemEntry[]>> {
    try {
      const dirHandle = await this.getRegistry(paneType).getDirectoryHandle(virtualPath);
      const entries: FileSystemEntry[] = [];

      for await (const [name, handle] of dirHandle.entries()) {
        // Skip hidden files/folders
        if (name.startsWith(".") || name.startsWith("~")) {
          continue;
        }

        const entryPath = virtualPath === "/" 
          ? `/${name}` 
          : `${virtualPath}/${name}`;

        if (handle.kind === "directory") {
          entries.push({
            name,
            path: entryPath,
            type: "folder",
            size: 0,
            isDirectory: true,
          });
        } else {
          const fileHandle = handle as FileSystemFileHandle;
          const file = await fileHandle.getFile();
          entries.push({
            name,
            path: entryPath,
            type: "file",
            size: file.size,
            isDirectory: false,
            birthtime: file.lastModified,
            mtime: file.lastModified,
            atime: file.lastModified,
          });
        }
      }

      // Sort: folders first, then files, both alphabetically
      entries.sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) {
          return a.isDirectory ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return {
        success: true,
        data: entries,
      };
    } catch (error: any) {
      if (error.name === "NotFoundError") {
        return {
          success: false,
          error: "Directory not found",
        };
      }
      return {
        success: false,
        error: String(error),
      };
    }
  }

  async getFileStats(virtualPath: string, paneType: PaneType = "source"): Promise<FileSystemResult<{ size: number; isDirectory: boolean; isFile: boolean }>> {
    try {
      const registry = this.getRegistry(paneType);
      // Try as file first
      try {
        const fileHandle = await registry.getFileHandle(virtualPath);
        const file = await fileHandle.getFile();
        return {
          success: true,
          data: {
            size: file.size,
            isDirectory: false,
            isFile: true,
          },
        };
      } catch {
        // Not a file, try as directory
        const dirHandle = await registry.getDirectoryHandle(virtualPath);
        return {
          success: true,
          data: {
            size: 0,
            isDirectory: true,
            isFile: false,
          },
        };
      }
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  async createFolder(virtualPath: string, folderName: string, paneType: PaneType = "source"): Promise<FileSystemResult> {
    try {
      const dirHandle = await this.getRegistry(paneType).getDirectoryHandle(virtualPath);
      await dirHandle.getDirectoryHandle(folderName, { create: true });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  async deleteFile(virtualPath: string, paneType: PaneType = "source"): Promise<FileSystemResult> {
    try {
      const registry = this.getRegistry(paneType);
      const fileHandle = await registry.getFileHandle(virtualPath);
      const dirPath = virtualPath.substring(0, virtualPath.lastIndexOf("/")) || "/";
      const dirHandle = await registry.getDirectoryHandle(dirPath);
      const fileName = virtualPath.substring(virtualPath.lastIndexOf("/") + 1);
      await dirHandle.removeEntry(fileName);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  async deleteFolder(virtualPath: string, paneType: PaneType = "source"): Promise<FileSystemResult> {
    try {
      const registry = this.getRegistry(paneType);
      const dirHandle = await registry.getDirectoryHandle(virtualPath);
      const parentPath = virtualPath.substring(0, virtualPath.lastIndexOf("/")) || "/";
      const parentHandle = await registry.getDirectoryHandle(parentPath);
      const folderName = virtualPath.substring(virtualPath.lastIndexOf("/") + 1);
      await parentHandle.removeEntry(folderName, { recursive: true });
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  async copyFile(
    sourceVirtualPath: string,
    destVirtualPath: string,
    fileName?: string,
    sourcePane: PaneType = "source",
    destPane: PaneType = "dest"
  ): Promise<FileSystemResult> {
    try {
      const sourceFileHandle = await this.getRegistry(sourcePane).getFileHandle(sourceVirtualPath);
      const sourceFile = await sourceFileHandle.getFile();
      
      const destDirHandle = await this.getRegistry(destPane).getDirectoryHandle(destVirtualPath);
      const finalFileName = fileName || sourceFile.name;
      
      // Check if file already exists and remove it
      try {
        await destDirHandle.removeEntry(finalFileName);
      } catch {
        // File doesn't exist, that's fine
      }

      // Create new file handle and write
      const destFileHandle = await destDirHandle.getFileHandle(finalFileName, { create: true });
      const writable = await destFileHandle.createWritable();
      await writable.write(sourceFile);
      await writable.close();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  async copyFolder(
    sourceVirtualPath: string,
    destVirtualPath: string,
    sourcePane: PaneType = "source",
    destPane: PaneType = "dest"
  ): Promise<FileSystemResult> {
    try {
      const sourceDirHandle = await this.getRegistry(sourcePane).getDirectoryHandle(sourceVirtualPath);
      const folderName = sourceVirtualPath.substring(sourceVirtualPath.lastIndexOf("/") + 1);
      const destDirHandle = await this.getRegistry(destPane).getDirectoryHandle(destVirtualPath);

      // Create destination folder
      const newFolderHandle = await destDirHandle.getDirectoryHandle(folderName, { create: true });

      // Recursively copy all entries
      await this.copyFolderRecursive(sourceDirHandle, newFolderHandle);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  private async copyFolderRecursive(
    sourceHandle: FileSystemDirectoryHandle,
    destHandle: FileSystemDirectoryHandle
  ): Promise<void> {
    for await (const [name, handle] of sourceHandle.entries()) {
      if (handle.kind === "directory") {
        const subFolderHandle = await destHandle.getDirectoryHandle(name, { create: true });
        await this.copyFolderRecursive(handle as FileSystemDirectoryHandle, subFolderHandle);
      } else {
        const fileHandle = handle as FileSystemFileHandle;
        const file = await fileHandle.getFile();
        const destFileHandle = await destHandle.getFileHandle(name, { create: true });
        const writable = await destFileHandle.createWritable();
        await writable.write(file);
        await writable.close();
      }
    }
  }

  async getFileBlob(virtualPath: string, paneType: PaneType = "source"): Promise<FileSystemResult<string>> {
    try {
      const fileHandle = await this.getRegistry(paneType).getFileHandle(virtualPath);
      const file = await fileHandle.getFile();
      const blob = new Blob([file], { type: file.type });
      
      // Create object URL
      const objectUrl = URL.createObjectURL(blob);
      
      return {
        success: true,
        data: objectUrl,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  async getAudioFileBlob(virtualPath: string, paneType: PaneType = "source"): Promise<FileSystemResult<string>> {
    return this.getFileBlob(virtualPath, paneType);
  }

  async getVideoFileBlob(virtualPath: string, paneType: PaneType = "source"): Promise<FileSystemResult<string>> {
    return this.getFileBlob(virtualPath, paneType);
  }

  async convertAndCopyFile(
    sourceVirtualPath: string,
    destVirtualPath: string,
    fileName: string,
    targetSampleRate?: number,
    sampleDepth?: string,
    fileFormat?: string,
    mono?: boolean,
    normalize?: boolean,
    trimStart?: boolean,
    sourcePane: PaneType = "source",
    destPane: PaneType = "dest"
  ): Promise<FileSystemResult> {
    try {
      // Get source file
      const sourceFile = await this.getFile(sourceVirtualPath, sourcePane);
      if (!sourceFile) {
        return {
          success: false,
          error: "Source file not found",
        };
      }

      // Check if conversion is needed
      const needsConversion = !!(
        targetSampleRate ||
        sampleDepth === "16-bit" ||
        mono ||
        normalize ||
        fileFormat === "WAV" ||
        trimStart
      );

      let finalFile: File | Blob = sourceFile;
      let finalFileName = fileName;

      // Perform conversion if needed
      if (needsConversion) {
        const { convertAudio } = await import('./audioConverter');
        const convertedBlob = await convertAudio(sourceFile, {
          sampleRate: targetSampleRate,
          bitDepth: sampleDepth as '16-bit' | 'dont-change',
          mono,
          normalize,
          trimStart,
          format: fileFormat as 'WAV' | 'dont-change',
        });

        // Update filename extension if converting to WAV
        if (fileFormat === "WAV") {
          finalFileName = fileName.replace(/\.\w+$/i, ".wav");
        }

        finalFile = convertedBlob;
      }

      // Write to destination (ensure nested dirs exist)
      const destDirHandle = await this.getRegistry(destPane).ensureDirectory(destVirtualPath);
      
      // Remove existing file if it exists
      try {
        await destDirHandle.removeEntry(finalFileName);
      } catch {
        // File doesn't exist, that's fine
      }

      const destFileHandle = await destDirHandle.getFileHandle(finalFileName, { create: true });
      const writable = await destFileHandle.createWritable();
      
      if (finalFile instanceof File) {
        await writable.write(finalFile);
      } else {
        await writable.write(finalFile);
      }
      
      await writable.close();

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  async searchFiles(query: string, searchPath?: string, paneType: PaneType = "source"): Promise<FileSystemResult<FileSystemEntry[]>> {
    // Simple recursive search implementation
    try {
      const startPath = searchPath || "/";
      const results: FileSystemEntry[] = [];

      await this.searchRecursive(startPath, query, results, paneType);

      return {
        success: true,
        data: results,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  private async searchRecursive(
    virtualPath: string,
    query: string,
    results: FileSystemEntry[],
    paneType: PaneType
  ): Promise<void> {
    try {
      const entries = await this.readDirectory(virtualPath, paneType);
      if (!entries.success || !entries.data) {
        return;
      }

      for (const entry of entries.data) {
        if (entry.name.toLowerCase().includes(query.toLowerCase())) {
          results.push(entry);
        }
        if (entry.isDirectory) {
          await this.searchRecursive(entry.path, query, results, paneType);
        }
      }
    } catch (error) {
      // Skip directories we can't access
      console.error(`Error searching in ${virtualPath}:`, error);
    }
  }

  private static readonly AUDIO_EXT = /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i;

  async listAudioFilesRecursively(
    startPath: string,
    paneType: PaneType = "source"
  ): Promise<FileSystemResult<FileSystemEntry[]>> {
    try {
      const results: FileSystemEntry[] = [];
      const path = startPath || "/";
      await this.collectAudioFilesRecursive(path, results, paneType);
      return { success: true, data: results };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }

  private async collectAudioFilesRecursive(
    virtualPath: string,
    results: FileSystemEntry[],
    paneType: PaneType
  ): Promise<void> {
    try {
      const entries = await this.readDirectory(virtualPath, paneType);
      if (!entries.success || !entries.data) return;

      for (const entry of entries.data) {
        if (entry.isDirectory) {
          await this.collectAudioFilesRecursive(entry.path, results, paneType);
        } else if (FileSystemService.AUDIO_EXT.test(entry.name)) {
          results.push(entry);
        }
      }
    } catch (error) {
      console.error(`Error listing audio in ${virtualPath}:`, error);
    }
  }

  // Helper method to get File object from virtual path
  async getFile(virtualPath: string, paneType: PaneType = "source"): Promise<File | null> {
    try {
      const fileHandle = await this.getRegistry(paneType).getFileHandle(virtualPath);
      return await fileHandle.getFile();
    } catch {
      return null;
    }
  }

  // Helper method to add a file from File object (for drag-and-drop)
  async addFileFromDrop(
    file: File,
    destVirtualPath: string,
    paneType: PaneType = "dest"
  ): Promise<FileSystemResult<string>> {
    try {
      const destDirHandle = await this.getRegistry(paneType).getDirectoryHandle(destVirtualPath);
      const fileHandle = await destDirHandle.getFileHandle(file.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(file);
      await writable.close();

      const newPath = destVirtualPath === "/" 
        ? `/${file.name}` 
        : `${destVirtualPath}/${file.name}`;

      return {
        success: true,
        data: newPath,
      };
    } catch (error) {
      return {
        success: false,
        error: String(error),
      };
    }
  }
}

export const fileSystemService = new FileSystemService();
