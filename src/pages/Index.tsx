import { useState, useCallback, useEffect, useRef } from "react";
import { FilePane } from "@/components/FilePane";
import { FavoritesColumn } from "@/components/FavoritesColumn";
import { FormatDropdown } from "@/components/FormatDropdown";
import { AboutDialog } from "@/components/AboutDialog";
import { Link } from "@tanstack/react-router";
import { ConversionConfirmDialog } from "@/components/ConversionConfirmDialog";
import { OverwriteConfirmDialog, type OverwriteChoice } from "@/components/OverwriteConfirmDialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import MiddleEllipsis from "@/components/MiddleEllipsis";
import { Progress } from "@/components/ui/progress";
import { Play, HelpCircle, Activity } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useMultiSampleStore } from "@/stores/multi-sample-store";
import { useSampleEditsStore } from "@/stores/sample-edits-store";
import { useShallow } from "zustand/react/shallow";
import { useWaveformEditorStore } from "@/stores/waveform-editor-store";
import { MultiSampleStack } from "@/components/MultiSampleStack";
import { AudioPreview } from "@/components/AudioPreview";
import { fileSystemService } from "@/lib/fileSystem";
import type { FileSystemEntry } from "@/lib/fileSystem";
import { toast } from "sonner";
import { useAppOptionsStore } from "@/stores/app-options-store";
import { useFormatPresetStore } from "@/stores/format-preset-store";
import { capture } from "@/lib/analytics";
import { parseBpmFromString, replaceBpmInString } from "@/lib/tempoUtils";
import { hasDirectoryPickerSupport } from "@/lib/browserSupport";
import { ReleaseNotesPanel } from "@/components/ReleaseNotesPanel";
import { ReleaseTourPointer } from "@/components/ReleaseTourPointer";
import { useReleaseTourStore } from "@/stores/release-tour-store";
import { useUnifiedPlayer } from "@/hooks/useUnifiedPlayer";

function dirname(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "/";
  }
  return "/" + parts.slice(0, -1).join("/");
}

function basename(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

function isAudioFile(fileName: string): boolean {
  return /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i.test(fileName);
}

function isUnsupportedBrowser(): boolean {
  return !hasDirectoryPickerSupport();
}

function joinPath(...parts: string[]): string {
  if (parts.length === 0) return "";
  const normalized = parts.filter(Boolean).map((p) => p.replace(/\\/g, "/"));
  let result = normalized[0];
  for (let i = 1; i < normalized.length; i++) {
    if (!result.endsWith("/")) result += "/";
    result += normalized[i].replace(/^\//, "");
  }
  return result.replace(/\/+/g, "/");
}

const BPM_MIN = 50;
const BPM_MAX = 240;

function getBpmFromPath(name: string, path: string): number | null {
  const fromName = parseBpmFromString(name);
  if (fromName) return fromName.bpm;
  const parts = path.split("/").filter(Boolean);
  if (parts.length >= 2) {
    const parentFolder = parts[parts.length - 2];
    const fromFolder = parentFolder ? parseBpmFromString(parentFolder) : null;
    if (fromFolder) return fromFolder.bpm;
  }
  return null;
}

function BpmInput({
  value,
  onChange,
  bpmAuto,
  onBpmAutoChange,
}: {
  value: number;
  onChange: (v: number) => void;
  bpmAuto: boolean;
  onBpmAutoChange: (enabled: boolean) => void;
}) {
  const [editingValue, setEditingValue] = useState<string | null>(null);
  const displayValue = editingValue ?? String(value);
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="header-tempo" className="text-xs text-muted-foreground shrink-0">
        BPM
      </label>
      <input
        id="header-tempo"
        type="text"
        inputMode="numeric"
        min={BPM_MIN}
        max={BPM_MAX}
        value={displayValue}
        onFocus={() => setEditingValue(String(value))}
        onChange={(e) => setEditingValue(e.target.value)}
        onBlur={() => {
          const n = parseInt(editingValue ?? "", 10);
          if (Number.isFinite(n) && n >= BPM_MIN && n <= BPM_MAX) {
            onChange(n);
            onBpmAutoChange(false);
          }
          setEditingValue(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        className="h-7 w-14 rounded-md border border-input bg-background px-2 text-sm"
      />
      <Toggle
        size="sm"
        variant="outline"
        pressed={bpmAuto}
        onPressedChange={onBpmAutoChange}
        aria-label="Auto-detect BPM from filename"
        data-testid="bpm-auto-toggle"
        className="h-7 px-2 text-xs"
      >
        Auto
      </Toggle>
    </div>
  );
}

async function yieldToUi(): Promise<void> {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });
}

const Index = () => {
  useUnifiedPlayer();

  const [aboutOpen, setAboutOpen] = useState(false);
  const devMode = useAppOptionsStore((s) => s.devMode);
  const setDevMode = useAppOptionsStore((s) => s.setDevMode);
  const previewMode = useMultiSampleStore((s) => s.previewMode);
  const setPreviewMode = useMultiSampleStore((s) => s.setPreviewMode);
  const addSamplesToStack = useMultiSampleStore((s) => s.addSamplesToStack);
  const globalTempoBpm = useMultiSampleStore((s) => s.globalTempoBpm);
  const setGlobalTempoBpm = useMultiSampleStore((s) => s.setGlobalTempoBpm);
  const bpmAuto = useMultiSampleStore((s) => s.bpmAuto);
  const setBpmAuto = useMultiSampleStore((s) => s.setBpmAuto);
  const [unsupportedBrowserDialogOpen, setUnsupportedBrowserDialogOpen] = useState(false);
  const [sourcePath, setSourcePath] = useState("");
  const [sourceVolumeId, setSourceVolumeId] = useState("_default");
  const [destPath, setDestPath] = useState("");
  const [destVolumeId, setDestVolumeId] = useState("_default");
  const [requestedSourcePath, setRequestedSourcePath] = useState<string | null>(null);
  const [requestedDestPath, setRequestedDestPath] = useState<string | null>(null);
  const [requestedSourceRevealPath, setRequestedSourceRevealPath] = useState<string | null>(null);
  const [requestedDestRevealPath, setRequestedDestRevealPath] = useState<string | null>(null);
  const [selectedSourceItem, setSelectedSourceItem] = useState<{ path: string; type: "file" | "folder"; name: string } | null>(null);
  const [selectedDestItem, setSelectedDestItem] = useState<{ path: string; type: "file" | "folder"; name: string } | null>(null);
  const [sourceRootVersion, setSourceRootVersion] = useState(0);
  const [destRootVersion, setDestRootVersion] = useState(0);
  const [sourceRefreshToken, setSourceRefreshToken] = useState(0);
  const [destRefreshToken, setDestRefreshToken] = useState(0);
  const formatSettings = useFormatPresetStore((s) => s.currentPreset.settings);
  const waveformEditor = useWaveformEditorStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      filePath: s.filePath,
      fileName: s.fileName,
      paneType: s.paneType,
      isEmptyState: s.isEmptyState,
      multiSampleId: s.multiSampleId,
      close: s.close,
    }))
  );
  const [conversionConfirmOpen, setConversionConfirmOpen] = useState(false);
  const [conversionProgress, setConversionProgress] = useState<{
    isVisible: boolean;
    current: number;
    total: number;
    currentFile: string;
  } | null>(null);
  const [pendingConversionRequest, setPendingConversionRequest] = useState<{
    files: FileSystemEntry[];
    sourceBasePath: string;
    destinationBasePath: string;
  } | null>(null);
  const [cancelConversionPromptOpen, setCancelConversionPromptOpen] = useState(false);
  const [overwriteConfirmOpen, setOverwriteConfirmOpen] = useState(false);
  const conversionCancelRequestedRef = useRef(false);
  const conversionAbortControllerRef = useRef<AbortController | null>(null);
  const overwriteChoiceResolverRef = useRef<((choice: OverwriteChoice) => void) | null>(null);

  const promptOverwriteChoice = useCallback((): Promise<OverwriteChoice> => {
    setOverwriteConfirmOpen(true);
    return new Promise<OverwriteChoice>((resolve) => {
      overwriteChoiceResolverRef.current = resolve;
    });
  }, []);

  const handleOverwriteChoice = useCallback((choice: OverwriteChoice) => {
    setOverwriteConfirmOpen(false);
    const resolver = overwriteChoiceResolverRef.current;
    overwriteChoiceResolverRef.current = null;
    resolver?.(choice);
  }, []);

  useEffect(() => {
    if (isUnsupportedBrowser()) {
      setUnsupportedBrowserDialogOpen(true);
    }
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (params.get("release-tour") === "1" || params.get("release-tour") === "true") {
      useReleaseTourStore.getState().loadAndStart();
    }
  }, []);

  const tourActive = useReleaseTourStore((s) => s.isActive);
  const requestedDemoPaths = useReleaseTourStore((s) => s.requestedDemoPaths);
  useEffect(() => {
    if (!tourActive || !requestedDemoPaths) return;
    if (!fileSystemService.hasRootForPane("source") || !fileSystemService.hasRootForPane("dest")) return;
    if (requestedDemoPaths.sourcePath) setRequestedSourcePath(requestedDemoPaths.sourcePath);
    if (requestedDemoPaths.destPath) setRequestedDestPath(requestedDemoPaths.destPath);
  }, [tourActive, requestedDemoPaths?.sourcePath, requestedDemoPaths?.destPath]);

  useEffect(() => {
    if (!unsupportedBrowserDialogOpen) return;
    capture("octacard_dialog_opened", { dialog_name: "unsupported_browser" });
  }, [unsupportedBrowserDialogOpen]);

  useEffect(() => {
    if (
      !bpmAuto ||
      !selectedSourceItem ||
      selectedSourceItem.type !== "file" ||
      !isAudioFile(selectedSourceItem.name)
    ) {
      return;
    }
    const bpm = getBpmFromPath(selectedSourceItem.name, selectedSourceItem.path);
    if (bpm != null) {
      setGlobalTempoBpm(bpm);
    }
  }, [bpmAuto, selectedSourceItem, setGlobalTempoBpm]);

  const handleSourcePathChange = useCallback((path: string, volumeId: string) => {
    setSourcePath(path);
    setSourceVolumeId(volumeId);
  }, []);

  const handleDestPathChange = useCallback((path: string, volumeId: string) => {
    setDestPath(path);
    setDestVolumeId(volumeId);
  }, []);

  const handleRequestedSourcePathHandled = useCallback(() => setRequestedSourcePath(null), []);
  const handleRequestedDestPathHandled = useCallback(() => setRequestedDestPath(null), []);
  const handleRequestedSourceRevealPathHandled = useCallback(() => setRequestedSourceRevealPath(null), []);
  const handleRequestedDestRevealPathHandled = useCallback(() => setRequestedDestRevealPath(null), []);

  const initializeRootDirectories = useCallback(async () => {
    const result = await fileSystemService.requestRootDirectory();
    if (result.success) {
      setSourceRootVersion((v) => v + 1);
      setDestRootVersion((v) => v + 1);
      if (result.warning) {
        toast.warning("Same Folder Selected", {
          description: result.warning,
          duration: 6000,
        });
      }
      return true;
    }
    if (isUnsupportedBrowser()) {
      toast.error("Browser Not Supported", {
        description:
          "OctaCard supports Brave, Chrome, and other Chromium-based browsers (including ChatGPT Atlas). Safari, Firefox, and other non-Chromium browsers are not supported.",
        duration: 8000,
      });
    } else if (result.error !== "User cancelled directory selection") {
      toast.error("Failed to Browse Folder", {
        description: result.error || "Unable to open folder picker. Please try again.",
      });
    }
    return false;
  }, []);

  const handleFileTransfer = (sourcePath: string, destinationPath: string) => {
    console.log("File transfer completed:", { sourcePath, destinationPath });
  };

  const handleStartConversion = async () => {
    if (
      !fileSystemService.hasRootForPane("source") ||
      !fileSystemService.hasRootForPane("dest")
    ) {
      return;
    }
    const sourceSelection = selectedSourceItem ?? {
      path: sourcePath || "/",
      type: "folder" as const,
      name: "",
    };
    const destinationSelectionPath =
      selectedDestItem?.type === "folder" ? selectedDestItem.path : destPath || "/";

    let files: FileSystemEntry[] = [];
    let sourceBasePath = sourceSelection.path;

    if (sourceSelection.type === "file") {
      if (!isAudioFile(sourceSelection.name)) {
        return;
      }
      sourceBasePath = dirname(sourceSelection.path);
      files = [
        {
          name: sourceSelection.name,
          path: sourceSelection.path,
          type: "file",
          size: 0,
          isDirectory: false,
        },
      ];
    } else {
      const result = await fileSystemService.listAudioFilesRecursively(sourceSelection.path, "source");
      if (!result.success || !result.data) {
        return;
      }
      files = result.data;

      const sourceFolderName = sourceSelection.name || basename(sourceSelection.path);
      const destinationFolderName = basename(destinationSelectionPath);
      const hasSameFolderName =
        sourceFolderName.length > 0 &&
        destinationFolderName.length > 0 &&
        sourceFolderName.toLowerCase() === destinationFolderName.toLowerCase();

      // Default behavior: preserve the selected source folder in destination.
      // Exception: when source and destination folder names match, copy only contents.
      sourceBasePath =
        sourceSelection.path !== "/" && !hasSameFolderName
          ? dirname(sourceSelection.path)
          : sourceSelection.path;
    }

    if (files.length === 0) {
      return;
    }

    setPendingConversionRequest({
      files,
      sourceBasePath,
      destinationBasePath: destinationSelectionPath,
    });
    setConversionConfirmOpen(true);
  };

  const handleConversionConfirm = async () => {
    setConversionConfirmOpen(false);
    const request = pendingConversionRequest;
    if (!request || request.files.length === 0) return;
    const { files, sourceBasePath, destinationBasePath } = request;
    conversionCancelRequestedRef.current = false;
    conversionAbortControllerRef.current = new AbortController();

    const targetSampleRate =
      formatSettings.sampleRate === "dont-change"
        ? undefined
        : parseInt(formatSettings.sampleRate, 10);

    setConversionProgress({
      isVisible: true,
      current: 0,
      total: request.files.length,
      currentFile: "",
    });

    const errors: Array<{ name: string; error: string }> = [];
    let overwritePolicy: "ask" | "skip" | "continue" = "ask";
    let overwriteAborted = false;

    const resolveOverwriteAction = async (targetPath: string): Promise<"overwrite" | "skip" | "abort"> => {
      const statsResult = await fileSystemService.getFileStats(targetPath, "dest");
      const willOverwrite = statsResult.success && statsResult.data?.isFile;
      if (!willOverwrite) return "overwrite";

      if (overwritePolicy === "continue") return "overwrite";
      if (overwritePolicy === "skip") return "skip";

      const choice = await promptOverwriteChoice();
      if (choice === "continue") {
        overwritePolicy = "continue";
        return "overwrite";
      }
      if (choice === "skip-all") {
        overwritePolicy = "skip";
        return "skip";
      }
      overwriteAborted = true;
      return "abort";
    };

    try {
      for (let i = 0; i < files.length; i++) {
        if (conversionCancelRequestedRef.current) {
          break;
        }
        await yieldToUi();
        if (conversionCancelRequestedRef.current) {
          break;
        }
        const entry = files[i];
        setConversionProgress((p) =>
          p ? { ...p, current: i, currentFile: entry.name } : p
        );

        const sourcePrefix = sourceBasePath === "/" ? "/" : `${sourceBasePath}/`;
        const relativePath = entry.path.startsWith(sourcePrefix)
          ? entry.path.slice(sourcePrefix.length)
          : entry.name;
        const dirParts = relativePath.split("/");
        let fileName = dirParts.pop() || entry.name;

        // Parse BPM: filename first, then immediate parent folder
        let bpmResult = parseBpmFromString(entry.name);
        let tempoFromFolder = false;
        let parentFolderName: string | undefined;
        if (!bpmResult) {
          const pathParts = entry.path.split("/").filter(Boolean);
          if (pathParts.length >= 2) {
            parentFolderName = pathParts[pathParts.length - 2];
            bpmResult = parentFolderName
              ? parseBpmFromString(parentFolderName)
              : null;
            tempoFromFolder = !!bpmResult;
          }
        }

        const targetBpm =
          formatSettings.tempo !== "dont-change"
            ? parseInt(formatSettings.tempo, 10)
            : undefined;
        const sourceBpm = bpmResult?.bpm;
        const applyTempo =
          targetBpm != null &&
          Number.isFinite(targetBpm) &&
          sourceBpm != null &&
          formatSettings.tempo !== "dont-change";

        let destDir = dirParts.length
          ? `${destinationBasePath}/${dirParts.join("/")}`
          : destinationBasePath;

        if (applyTempo) {
          if (tempoFromFolder && parentFolderName) {
            const updatedDirParts = dirParts.map((p) =>
              p === parentFolderName
                ? replaceBpmInString(p, sourceBpm, targetBpm)
                : p
            );
            destDir =
              updatedDirParts.length > 0
                ? `${destinationBasePath}/${updatedDirParts.join("/")}`
                : destinationBasePath;
          } else {
            fileName = replaceBpmInString(entry.name, sourceBpm, targetBpm);
          }
        }

        const targetPath = joinPath(destDir, fileName);
        const overwriteAction = await resolveOverwriteAction(targetPath);
        if (overwriteAction === "abort") {
          break;
        }
        if (overwriteAction === "skip") {
          continue;
        }

        const sampleEdits = useSampleEditsStore.getState().getEdits(entry.path);

        const result = await fileSystemService.convertAndCopyFile(
          entry.path,
          destDir,
          fileName,
          targetSampleRate,
          formatSettings.sampleDepth === "dont-change" ? undefined : formatSettings.sampleDepth,
          formatSettings.fileFormat === "dont-change" ? undefined : formatSettings.fileFormat,
          formatSettings.pitch === "dont-change" ? undefined : formatSettings.pitch,
          formatSettings.sanitizeFilename,
          formatSettings.mono,
          formatSettings.normalize,
          formatSettings.trim,
          applyTempo ? targetBpm : undefined,
          applyTempo ? sourceBpm : undefined,
          "source",
          "dest",
          conversionAbortControllerRef.current.signal,
          formatSettings.shortenFilename,
          formatSettings.shortenFilenameMaxLength,
          sampleEdits,
        );
        if (!result.success) {
          if (result.cancelled || conversionCancelRequestedRef.current) {
            break;
          }
          errors.push({ name: entry.name, error: result.error || "Conversion failed" });
        }
      }

      if (conversionCancelRequestedRef.current) {
        setConversionProgress(null);
        setPendingConversionRequest(null);
        toast("Conversion Cancelled", {
          description: "Stopped converting files.",
        });
        return;
      }

      if (overwriteAborted) {
        setConversionProgress(null);
        setPendingConversionRequest(null);
        toast("Conversion Cancelled", {
          description: "Operation aborted before overwriting existing files.",
        });
        return;
      }

      setConversionProgress((p) =>
        p ? { ...p, current: files.length, currentFile: "" } : p
      );
      setDestRefreshToken((v) => v + 1);
      setPendingConversionRequest(null);
      setTimeout(() => setConversionProgress(null), 500);

      if (errors.length > 0) {
        const failedCount = errors.length;
        const totalCount = files.length;
        toast.error(
          failedCount === totalCount ? "Conversion Failed" : "Some Files Failed",
          {
            description:
              failedCount === totalCount
                ? errors[0]?.error ?? "Unable to convert files."
                : `${failedCount} of ${totalCount} files failed: ${errors.map((e) => e.name).join(", ")}`,
            duration: 6000,
          }
        );
      }

      const hasConversion =
        formatSettings.sampleRate !== "dont-change" ||
        formatSettings.sampleDepth !== "dont-change" ||
        formatSettings.fileFormat !== "dont-change" ||
        formatSettings.pitch !== "dont-change" ||
        formatSettings.sanitizeFilename ||
        formatSettings.shortenFilename ||
        formatSettings.mono ||
        formatSettings.normalize ||
        formatSettings.trim ||
        formatSettings.tempo !== "dont-change";

      capture("octacard_conversion_completed", {
        file_count: files.length,
        error_count: errors.length,
        has_conversion: hasConversion,
        settings: {
          sampleRate: formatSettings.sampleRate,
          sampleDepth: formatSettings.sampleDepth,
          fileFormat: formatSettings.fileFormat,
          pitch: formatSettings.pitch,
          sanitizeFilename: formatSettings.sanitizeFilename,
          shortenFilename: formatSettings.shortenFilename,
          shortenFilenameMaxLength: formatSettings.shortenFilenameMaxLength,
          mono: formatSettings.mono,
          normalize: formatSettings.normalize,
          trimStart: formatSettings.trim,
          tempo: formatSettings.tempo,
        },
      });
    } catch (err) {
      if (conversionCancelRequestedRef.current) {
        setConversionProgress(null);
        setPendingConversionRequest(null);
        return;
      }
      setConversionProgress(null);
      setPendingConversionRequest(null);
      toast.error("Conversion Failed", {
        description: err instanceof Error ? err.message : "Unable to convert files.",
        duration: 6000,
      });

      const hasConversion =
        formatSettings.sampleRate !== "dont-change" ||
        formatSettings.sampleDepth !== "dont-change" ||
        formatSettings.fileFormat !== "dont-change" ||
        formatSettings.mono ||
        formatSettings.sanitizeFilename ||
        formatSettings.shortenFilename ||
        formatSettings.normalize ||
        formatSettings.trim ||
        formatSettings.tempo !== "dont-change";

      capture("octacard_conversion_failed", {
        file_count: files.length,
        has_conversion: hasConversion,
        settings: {
          sampleRate: formatSettings.sampleRate,
          sampleDepth: formatSettings.sampleDepth,
          fileFormat: formatSettings.fileFormat,
          sanitizeFilename: formatSettings.sanitizeFilename,
          shortenFilename: formatSettings.shortenFilename,
          shortenFilenameMaxLength: formatSettings.shortenFilenameMaxLength,
          mono: formatSettings.mono,
          normalize: formatSettings.normalize,
          trimStart: formatSettings.trim,
          tempo: formatSettings.tempo,
        },
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      conversionAbortControllerRef.current = null;
      setCancelConversionPromptOpen(false);
    }
  };

  const applyBrowseSelection = (
    paneType: "source" | "dest",
    selection: { reusedExistingRoot: boolean; virtualPath: string }
  ) => {
    const revealPath = selection.virtualPath === "/" ? null : selection.virtualPath;
    if (paneType === "source") {
      if (!selection.reusedExistingRoot) {
        setSourceRootVersion((v) => v + 1);
      }
      if (revealPath) {
        setRequestedSourceRevealPath(revealPath);
      }
    } else {
      if (!selection.reusedExistingRoot) {
        setDestRootVersion((v) => v + 1);
      }
      if (revealPath) {
        setRequestedDestRevealPath(revealPath);
      }
    }
  };

  const handleBrowseForFolder = async (paneType: "source" | "dest", currentPath?: string) => {
    // Always use pane-specific selection so source and dest remain independent.
    // Do NOT fall back to requestRootDirectory (which sets both) when selecting from a specific pane.
    const result = await fileSystemService.requestDirectoryForPane(paneType, currentPath);
    if (result.success && result.data) {
      applyBrowseSelection(paneType, result.data);
      if (result.warning) {
        toast.warning("Same Folder Selected", {
          description: result.warning,
          duration: 6000,
        });
      }
    } else if (!result.success) {
      if (isUnsupportedBrowser()) {
        toast.error("Browser Not Supported", {
          description:
            "OctaCard supports Brave, Chrome, and other Chromium-based browsers (including ChatGPT Atlas). Safari, Firefox, and other non-Chromium browsers are not supported.",
          duration: 8000,
        });
      } else if (result.error !== "User cancelled directory selection") {
        toast.error("Failed to Browse Folder", {
          description: result.error || "Unable to open folder picker. Please try again.",
        });
      }
    }
  };

  const handlePreviewModeChange = useCallback(
    (value: string) => {
      if (value === "multi") {
        setPreviewMode("multi");
        const toAdd: Array<{ path: string; name: string; paneType: "source" | "dest" }> = [];
        // If waveform editor has a file open, put it in the first slot
        const weState = useWaveformEditorStore.getState();
        if (weState.isOpen && !weState.isEmptyState && weState.filePath && weState.fileName && weState.paneType) {
          toAdd.push({ path: weState.filePath, name: weState.fileName, paneType: weState.paneType });
        }
        if (selectedSourceItem?.type === "file" && isAudioFile(selectedSourceItem.name)) {
          const alreadyAdded = toAdd.some((s) => s.path === selectedSourceItem.path);
          if (!alreadyAdded) toAdd.push({ path: selectedSourceItem.path, name: selectedSourceItem.name, paneType: "source" });
        }
        if (selectedDestItem?.type === "file" && isAudioFile(selectedDestItem.name)) {
          const alreadyAdded = toAdd.some((s) => s.path === selectedDestItem.path);
          if (!alreadyAdded) toAdd.push({ path: selectedDestItem.path, name: selectedDestItem.name, paneType: "dest" });
        }
        if (toAdd.length > 0) {
          useMultiSampleStore.getState().setActiveSlotIndex(0);
          addSamplesToStack(toAdd, 4);
          const { slots, activeSlotIndex } = useMultiSampleStore.getState();
          const sample = slots[activeSlotIndex];
          if (sample) {
            useWaveformEditorStore.getState().openWithFileFromMulti(sample.path, sample.name, sample.paneType, sample.id);
          }
        }
      } else {
        setPreviewMode("single");
      }
    },
    [setPreviewMode, addSamplesToStack, selectedSourceItem, selectedDestItem]
  );

  const handleBrowseFromFavorite = async (paneType: "source" | "dest", favoritePath: string) => {
    const result = await fileSystemService.requestDirectoryForPane(paneType, favoritePath);
    if (result.success && result.data) {
      applyBrowseSelection(paneType, result.data);
      if (result.warning) {
        toast.warning("Same Folder Selected", {
          description: result.warning,
          duration: 6000,
        });
      }
    } else if (!result.success) {
      if (isUnsupportedBrowser()) {
        toast.error("Browser Not Supported", {
          description:
            "OctaCard supports Brave, Chrome, and other Chromium-based browsers (including ChatGPT Atlas). Safari, Firefox, and other non-Chromium browsers are not supported.",
          duration: 8000,
        });
      } else if (result.error !== "User cancelled directory selection") {
        toast.error("Failed to Browse Folder", {
          description: result.error || "Unable to open folder picker. Please try again.",
        });
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card grid grid-cols-[1fr_auto_1fr] items-center px-4 shrink-0 gap-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="" className="w-8 h-8 dark:hidden" aria-hidden />
            <img src="/logo_white.png" alt="" className="w-8 h-8 hidden dark:block" aria-hidden />
            <h1 className="text-xl font-bold tracking-tight">OctaCard</h1>
          </div>
          <Button
            variant={previewMode === "multi" ? "default" : "outline"}
            size="sm"
            aria-pressed={previewMode === "multi"}
            aria-label="Multi preview"
            data-testid="multi-mode-toggle"
            onClick={() => handlePreviewModeChange(previewMode === "multi" ? "single" : "multi")}
          >
            Multi
          </Button>
          <Button
            variant="outline"
            size="sm"
            aria-label="Waveform editor"
            data-testid="waveform-editor-button"
            onClick={() => useWaveformEditorStore.getState().open()}
          >
            <Activity className="w-4 h-4 mr-1" />
            Waveform
          </Button>
          <BpmInput
            value={globalTempoBpm}
            onChange={setGlobalTempoBpm}
            bpmAuto={bpmAuto}
            onBpmAutoChange={setBpmAuto}
          />
        </div>
        <Button onClick={handleStartConversion} className="gap-2 justify-self-center" data-testid="convert-button">
          <Play className="w-4 h-4" />
          Convert
        </Button>
        <div className="flex items-center gap-2 justify-self-end">
          <Button
            variant={devMode ? "default" : "outline"}
            size="sm"
            data-testid="dev-mode-button"
            aria-pressed={devMode}
            onClick={() => setDevMode(!devMode)}
            className={
              devMode
                ? "border-orange-500 bg-orange-500 text-white hover:bg-orange-600 hover:text-white"
                : "border-orange-500 text-orange-600 hover:border-orange-600 hover:bg-orange-50 hover:text-orange-700"
            }
          >
            Dev Mode
          </Button>
          <FormatDropdown />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            asChild
            aria-label="Help"
          >
            <Link
              to="/help"
              onClick={() => capture("octacard_help_clicked", { source: "header" })}
            >
              <HelpCircle className="w-4 h-4" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setAboutOpen(true)}
          >
            About
          </Button>
          <ThemeToggle />
        </div>
      </header>

      <ReleaseNotesPanel />

      <ReleaseTourPointer />

      {/* Main Content: Flat 4-panel layout so favorites and browser dividers are independent */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
        <ResizablePanelGroup
          orientation="horizontal"
          className="flex-1 min-h-0 min-w-0"
          id="main-layout"
          defaultLayout={{
            "left-fav": 20,
            "source-browser": 30,
            "dest-browser": 30,
            "right-fav": 20,
          }}
        >
          {/* Left: Source Favorites - only this separator affects favorites vs center */}
          <ResizablePanel id="left-fav" defaultSize="20%" minSize="10%" maxSize="30%">
            <FavoritesColumn
              paneType="source"
              volumeId={sourceVolumeId}
              currentPath={sourcePath}
              onNavigate={setRequestedSourcePath}
              onBrowseFromFavorite={(path) => handleBrowseFromFavorite("source", path)}
              title="Source Favorites"
            />
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* Source Browser - center separator only affects source vs dest */}
          <ResizablePanel
            id="source-browser"
            defaultSize="30%"
            minSize="15%"
          >
            <div className="h-full min-h-0" data-testid="panel-source">
              <FilePane
                key={`source-${sourceRootVersion}`}
                paneName="source"
                title="Source"
                showSidebar={false}
                onPathChange={handleSourcePathChange}
                onSelectionChange={setSelectedSourceItem}
                onRequestedPathHandled={handleRequestedSourcePathHandled}
                requestedPath={requestedSourcePath}
                onRequestedRevealPathHandled={handleRequestedSourceRevealPathHandled}
                requestedRevealPath={requestedSourceRevealPath}
                dropMode="navigate"
                sampleRate={formatSettings.sampleRate}
                sampleDepth={formatSettings.sampleDepth}
                fileFormat={formatSettings.fileFormat}
                pitch={formatSettings.pitch}
                sanitizeFilename={formatSettings.sanitizeFilename}
                shortenFilename={formatSettings.shortenFilename}
                shortenFilenameMaxLength={formatSettings.shortenFilenameMaxLength}
                mono={formatSettings.mono}
                normalize={formatSettings.normalize}
                trimStart={formatSettings.trim}
                convertFiles={false}
                showEjectButton={false}
                showNewFolderButton={false}
                onBrowseForFolder={(path) => handleBrowseForFolder("source", path)}
                refreshToken={sourceRefreshToken}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* Dest Browser - center separator only affects source vs dest */}
          <ResizablePanel
            id="dest-browser"
            defaultSize="30%"
            minSize="15%"
          >
            <div className="h-full min-h-0" data-testid="panel-dest">
              <FilePane
                key={`dest-${destRootVersion}`}
                paneName="dest"
                title="Destination"
                onFileTransfer={handleFileTransfer}
                showSidebar={false}
                onPathChange={handleDestPathChange}
                onSelectionChange={setSelectedDestItem}
                onRequestedPathHandled={handleRequestedDestPathHandled}
                requestedPath={requestedDestPath}
                onRequestedRevealPathHandled={handleRequestedDestRevealPathHandled}
                requestedRevealPath={requestedDestRevealPath}
                dropMode="navigate"
                sampleRate={formatSettings.sampleRate}
                sampleDepth={formatSettings.sampleDepth}
                fileFormat={formatSettings.fileFormat}
                pitch={formatSettings.pitch}
                sanitizeFilename={formatSettings.sanitizeFilename}
                shortenFilename={formatSettings.shortenFilename}
                shortenFilenameMaxLength={formatSettings.shortenFilenameMaxLength}
                mono={formatSettings.mono}
                normalize={formatSettings.normalize}
                trimStart={formatSettings.trim}
                autoNavigateToCard={true}
                convertFiles={true}
                showEjectButton={true}
                showNewFolderButton={true}
                onBrowseForFolder={(path) => handleBrowseForFolder("dest", path)}
                refreshToken={destRefreshToken}
              />
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* Right: Dest Favorites - only this separator affects favorites vs center */}
          <ResizablePanel id="right-fav" defaultSize="20%" minSize="10%" maxSize="30%">
            <FavoritesColumn
              paneType="dest"
              volumeId={destVolumeId}
              currentPath={destPath}
              onNavigate={(path) => setRequestedDestPath(path)}
              onBrowseFromFavorite={(path) => handleBrowseFromFavorite("dest", path)}
              title="Dest Favorites"
            />
          </ResizablePanel>
        </ResizablePanelGroup>
        {waveformEditor.isOpen && (
          <AudioPreview
            filePath={waveformEditor.filePath}
            fileName={waveformEditor.fileName}
            paneType={waveformEditor.paneType}
            isEmptyState={waveformEditor.isEmptyState}
            multiSampleId={waveformEditor.multiSampleId}
            onClose={waveformEditor.close}
            onFileSaved={(pane) => {
              if (pane === "source") setSourceRefreshToken((t) => t + 1);
              else setDestRefreshToken((t) => t + 1);
            }}
          />
        )}
        {previewMode === "multi" && <MultiSampleStack className="shrink-0" />}
      </div>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      <Dialog open={unsupportedBrowserDialogOpen} onOpenChange={setUnsupportedBrowserDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Browser Not Supported</DialogTitle>
            <DialogDescription>
              OctaCard requires the File System Access API and currently supports Brave, Chrome, and other Chromium-based
              browsers (including ChatGPT Atlas). Safari, Firefox, and other non-Chromium browsers are not supported.
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {pendingConversionRequest && (
        <ConversionConfirmDialog
          open={conversionConfirmOpen}
          onOpenChange={(open) => {
            setConversionConfirmOpen(open);
            if (!open) setPendingConversionRequest(null);
          }}
          onConfirm={handleConversionConfirm}
          fileCount={pendingConversionRequest.files.length}
          settings={{
            sampleRate: formatSettings.sampleRate,
            sampleDepth: formatSettings.sampleDepth,
            fileFormat: formatSettings.fileFormat,
            pitch: formatSettings.pitch,
            sanitizeFilename: formatSettings.sanitizeFilename,
            shortenFilename: formatSettings.shortenFilename,
            shortenFilenameMaxLength: formatSettings.shortenFilenameMaxLength,
            mono: formatSettings.mono,
            normalize: formatSettings.normalize,
            trimStart: formatSettings.trim,
            tempo: formatSettings.tempo,
          }}
        />
      )}

      {conversionProgress?.isVisible && (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              setCancelConversionPromptOpen(true);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader className="min-w-0">
              <DialogTitle>Converting Files</DialogTitle>
              <DialogDescription className="mt-2 min-w-0">
                {conversionProgress.currentFile ? (
                  <MiddleEllipsis
                    className="w-full min-w-0 text-left"
                    data-testid="conversion-current-file"
                    value={conversionProgress.currentFile}
                  />
                ) : (
                  "Preparing conversion..."
                )}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Progress</span>
                  <span className="font-medium">
                    {conversionProgress.current} of {conversionProgress.total} files
                  </span>
                </div>
                <Progress
                  value={(conversionProgress.current / conversionProgress.total) * 100}
                  className="h-2"
                />
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <Dialog open={cancelConversionPromptOpen} onOpenChange={setCancelConversionPromptOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel conversion?</DialogTitle>
            <DialogDescription>
              Conversion is currently running. You can keep converting or cancel now.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelConversionPromptOpen(false)}>
              Keep Converting
            </Button>
            <Button
              onClick={() => {
                conversionCancelRequestedRef.current = true;
                setCancelConversionPromptOpen(false);
                conversionAbortControllerRef.current?.abort();
                setConversionProgress((p) =>
                  p ? { ...p, currentFile: "Cancelling conversion..." } : p
                );
              }}
            >
              Cancel Conversion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OverwriteConfirmDialog open={overwriteConfirmOpen} onChoice={handleOverwriteChoice} />
    </div>
  );
};

export default Index;
