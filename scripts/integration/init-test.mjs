/**
 * Shared test init script for integration tests.
 * Mocks file system, picker, and test hooks so the app runs in Playwright.
 */

export function testInitScript() {
  function createMinimalWavBlob() {
    const sampleRate = 44100,
      durationSeconds = 1,
      numSamples = sampleRate * durationSeconds * 2;
    const buffer = new ArrayBuffer(44 + numSamples);
    const view = new DataView(buffer);
    const writeStr = (o, s) => {
      for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
    };
    writeStr(0, "RIFF");
    view.setUint32(4, 36 + numSamples, true);
    writeStr(8, "WAVE");
    writeStr(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 2, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 4, true);
    view.setUint16(32, 4, true);
    view.setUint16(34, 16, true);
    writeStr(36, "data");
    view.setUint32(40, numSamples, true);
    return new Blob([buffer], { type: "audio/wav" });
  }
  /** Minimal valid AIFF (0.1s stereo 44.1kHz 16-bit) for FFmpeg conversion tests. */
  function createMinimalAiffBlob() {
    const sampleRate = 44100;
    const numFrames = 4410;
    const numChannels = 2;
    const pcmBytes = numFrames * numChannels * 2;
    const commSize = 18;
    const ssndSize = 8 + pcmBytes;
    const formSize = 4 + commSize + 4 + ssndSize;
    const totalSize = 8 + formSize;
    const buf = new ArrayBuffer(totalSize);
    const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    let o = 0;
    w(o, "FORM"); o += 4;
    v.setUint32(o, formSize, false); o += 4;
    w(o, "AIFF"); o += 4;
    w(o, "COMM"); o += 4;
    v.setUint32(o, commSize, false); o += 4;
    v.setUint16(o, numChannels, false); o += 2;
    v.setUint32(o, numFrames, false); o += 4;
    v.setUint16(o, 16, false); o += 2;
    v.setUint8(o++, 0x40); v.setUint8(o++, 0x0f); v.setUint8(o++, 0x8c); v.setUint8(o++, 0);
    for (let i = 0; i < 6; i++) v.setUint8(o++, 0);
    w(o, "SSND"); o += 4;
    v.setUint32(o, ssndSize, false); o += 4;
    v.setUint32(o, 0, false); o += 4;
    v.setUint32(o, 0, false); o += 4;
    return new Blob([buf], { type: "audio/aiff" });
  }
  const minimalWavBlob = createMinimalWavBlob();
  const minimalAiffBlob = createMinimalAiffBlob();

  class MockFileHandle {
    constructor(name, size = 64) {
      this.kind = "file";
      this.name = name;
      this._size = size;
    }

    async getFile() {
      if (/\.wav$/i.test(this.name)) {
        return new File([minimalWavBlob], this.name, { type: "audio/wav", lastModified: Date.now() });
      }
      if (/\.(aif|aiff)$/i.test(this.name)) {
        return new File([minimalAiffBlob], this.name, { type: "audio/aiff", lastModified: Date.now() });
      }
      return new File([new Uint8Array(this._size)], this.name, { lastModified: Date.now() });
    }

    async isSameEntry(other) {
      return other === this;
    }
  }

  class MockDirectoryHandle {
    constructor(name) {
      this.kind = "directory";
      this.name = name;
      this.parent = null;
      this.children = new Map();
    }

    addDirectory(child) {
      child.parent = this;
      this.children.set(child.name, child);
      return child;
    }

    addFile(name, size = 64) {
      this.children.set(name, new MockFileHandle(name, size));
    }

    async *entries() {
      window.__readDirectoryCalls = (window.__readDirectoryCalls ?? 0) + 1;
      for (const entry of this.children.entries()) {
        yield entry;
      }
    }

    async getDirectoryHandle(name, options = {}) {
      const entry = this.children.get(name);
      if (!entry || entry.kind !== "directory") {
        if (options?.create) {
          const created = new MockDirectoryHandle(name);
          this.addDirectory(created);
          return created;
        }
        throw new DOMException("Directory not found", "NotFoundError");
      }
      return entry;
    }

    async getFileHandle(name, options = {}) {
      const entry = this.children.get(name);
      if (!entry || entry.kind !== "file") {
        if (options?.create) {
          const created = new MockFileHandle(name);
          this.children.set(name, created);
          return created;
        }
        throw new DOMException("File not found", "NotFoundError");
      }
      return entry;
    }

    async resolve(target) {
      const pathParts = [];
      let cursor = target;
      while (cursor && cursor !== this) {
        pathParts.unshift(cursor.name);
        cursor = cursor.parent;
      }
      return cursor === this ? pathParts : null;
    }

    async isSameEntry(other) {
      return other === this;
    }
  }

  const root = new MockDirectoryHandle("Root");
  const alpha = root.addDirectory(new MockDirectoryHandle("Alpha"));
  const beta = root.addDirectory(new MockDirectoryHandle("Beta"));
  const guitars = alpha.addDirectory(new MockDirectoryHandle("Guitars"));
  const longNames = root.addDirectory(new MockDirectoryHandle("LongNames"));
  const bulk = root.addDirectory(new MockDirectoryHandle("Bulk"));
  const huge = root.addDirectory(new MockDirectoryHandle("Huge"));
  alpha.addFile("inside-alpha.wav", 128);
  alpha.addFile("Melô.wav", 128);
  alpha.addFile("Long Mélô Instrumental Version.wav", 128);
  guitars.addFile("clean_gtr_center.wav", 128);
  beta.addFile("inside-beta.wav", 128);
  root.addFile("top-level.txt", 32);
  longNames.addFile(
    "this-is-an-extremely-long-sample-name-designed-to-overflow-the-dialog-display.wav",
    128,
  );
  for (let i = 1; i <= 6; i++) {
    bulk.addFile(`bulk-${i}.wav`, 128);
  }
  for (let i = 1; i <= 300; i++) {
    huge.addFile(`huge-${i}.wav`, 64);
  }
  const fixtures = root.addDirectory(new MockDirectoryHandle("Fixtures"));
  fixtures.addFile("TVD_120_resampled_break_tape_vinyl_bear.wav", 128);
  fixtures.addFile("KJ_SAWKA_Drum_and_Bass_170_bpm_4bar14.aif", 128);

  const ensureDirectoryByPath = (virtualPath) => {
    const parts = virtualPath.split("/").filter(Boolean);
    let cursor = root;
    for (const part of parts) {
      let next = cursor.children.get(part);
      if (!next || next.kind !== "directory") {
        next = cursor.addDirectory(new MockDirectoryHandle(part));
      }
      cursor = next;
    }
    return cursor;
  };

  const addFileToPath = (virtualPath, fileName, size = 128) => {
    const dir = ensureDirectoryByPath(virtualPath);
    dir.addFile(fileName, size);
  };

  const pickerQueue = [root, root, root, root, root, root, alpha, beta, alpha];
  window.__pickerCalls = [];
  window.__octacardPickDirectory = async (startIn, options) => {
    window.__pickerCalls.push({
      startInName: startIn?.name ?? null,
      pickerId: options?.id ?? null,
    });
    return pickerQueue.shift() || startIn || root;
  };
  window.__listCalls = [];
  window.__convertCalls = [];
  window.__convertedOutputNames = [];
  window.__revealCalls = [];
  window.__readDirectoryCalls = 0;
  window.__octacardTestHooks = {
    resolveAnalysisSampleId: ({ path }) => {
      if (path === "/Alpha/inside-alpha.wav") return "sample-alpha-inside";
      return null;
    },
    listAudioFilesRecursively: ({ startPath, paneType }) => {
      window.__listCalls.push({ startPath, paneType });
      if (startPath === "/Alpha") {
        return {
          success: true,
          data: [
            {
              name: "inside-alpha.wav",
              path: "/Alpha/inside-alpha.wav",
              type: "file",
              size: 128,
              isDirectory: false,
            },
            {
              name: "Melô.wav",
              path: "/Alpha/Melô.wav",
              type: "file",
              size: 128,
              isDirectory: false,
            },
          ],
        };
      }
      if (startPath === "/LongNames") {
        return {
          success: true,
          data: [
            {
              name: "this-is-an-extremely-long-sample-name-designed-to-overflow-the-dialog-display.wav",
              path: "/LongNames/this-is-an-extremely-long-sample-name-designed-to-overflow-the-dialog-display.wav",
              type: "file",
              size: 128,
              isDirectory: false,
            },
          ],
        };
      }
      if (startPath === "/Bulk") {
        return {
          success: true,
          data: Array.from({ length: 6 }, (_, i) => ({
            name: `bulk-${i + 1}.wav`,
            path: `/Bulk/bulk-${i + 1}.wav`,
            type: "file",
            size: 128,
            isDirectory: false,
          })),
        };
      }
      if (startPath === "/Huge") {
        return {
          success: true,
          data: Array.from({ length: 300 }, (_, i) => ({
            name: `huge-${i + 1}.wav`,
            path: `/Huge/huge-${i + 1}.wav`,
            type: "file",
            size: 64,
            isDirectory: false,
          })),
        };
      }
      if (startPath === "/Fixtures") {
        return {
          success: true,
          data: [
            { name: "TVD_120_resampled_break_tape_vinyl_bear.wav", path: "/Fixtures/TVD_120_resampled_break_tape_vinyl_bear.wav", type: "file", size: 128, isDirectory: false },
            { name: "KJ_SAWKA_Drum_and_Bass_170_bpm_4bar14.aif", path: "/Fixtures/KJ_SAWKA_Drum_and_Bass_170_bpm_4bar14.aif", type: "file", size: 128, isDirectory: false },
          ],
        };
      }
      return { success: true, data: [] };
    },
    convertAndCopyFile: async (args) => {
      window.__convertCalls.push(args);
      if (args.sourceVirtualPath?.startsWith("/Bulk/")) {
        for (let i = 0; i < 20; i++) {
          if (args.signal?.aborted) {
            return { success: false, error: "Operation cancelled", cancelled: true };
          }
          await new Promise((resolve) => setTimeout(resolve, 25));
        }
      }
      let outputName = args.fileName;
      if (args.shortenFilename && Number.isFinite(args.shortenFilenameMaxLength)) {
        const sourceParts = String(args.sourceVirtualPath || "")
          .split("/")
          .filter(Boolean);
        const folderName = sourceParts.length >= 2 ? sourceParts[sourceParts.length - 2] : "";
        outputName = window.__octacardShortenFilename({
          folderName,
          filename: outputName,
          maxLength: args.shortenFilenameMaxLength,
        });
      }
      if (args.sanitizeFilename) {
        outputName = window.__octacardSanitizeFilename(outputName);
      }
      window.__convertedOutputNames.push(outputName);
      addFileToPath(args.destVirtualPath, outputName);
      if (args.fileName.length > 40) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
      }
      return { success: true };
    },
    revealInFinder: ({ virtualPath, paneType, isDirectory }) => {
      window.__revealCalls.push({ virtualPath, paneType, isDirectory });
      return { success: true };
    },
  };
  window.addEventListener("octacard-test-drop", async (event) => {
    const detail = event?.detail;
    if (!detail) return;
    const testConvert = window.__octacardTestHooks?.convertAndCopyFile;
    if (typeof testConvert !== "function") return;
    await testConvert({
      sourceVirtualPath: detail.sourceVirtualPath,
      destVirtualPath: detail.destVirtualPath,
      fileName: detail.fileName,
      targetSampleRate: detail.targetSampleRate,
      sampleDepth: detail.sampleDepth,
      fileFormat: detail.fileFormat,
      pitch: detail.pitch,
      sanitizeFilename: detail.sanitizeFilename,
      mono: detail.mono,
      normalize: detail.normalize,
      trimStart: detail.trimStart,
      sourcePane: "source",
      destPane: "dest",
    });
  });
  if (!localStorage.getItem("octacard_favorites_source__default")) {
    localStorage.setItem("octacard_favorites_source__default", JSON.stringify([{ path: "/Alpha", name: "Alpha" }]));
  }
  if (!localStorage.getItem("octacard_favorites_dest__default")) {
    localStorage.setItem("octacard_favorites_dest__default", JSON.stringify([{ path: "/Beta", name: "Beta" }]));
  }

  window.addEventListener("octacard-test-drop", async (e) => {
    const d = e.detail;
    if (!d?.sourcePath || !d?.destPath || !window.__octacardTestHooks?.convertAndCopyFile) return;
    const fileName = d.sourcePath.split("/").pop() || "file";
    await window.__octacardTestHooks.convertAndCopyFile({
      sourceVirtualPath: d.sourcePath,
      destVirtualPath: d.destPath,
      fileName,
      sourcePane: "source",
      destPane: "dest",
    });
  });
}
