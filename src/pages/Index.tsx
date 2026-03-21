import { useState, useCallback, useEffect, useRef } from "react";
import { FilePane } from "@/components/FilePane";
import { RemoteFilePane } from "@/components/RemoteFilePane";
import { TempFilesPane } from "@/components/TempFilesPane";
import { ProjectColumn } from "@/components/ProjectColumn";
import {
  LocalPackEditorDialog,
  type LocalPackEditorState,
} from "@/components/LocalPackEditorDialog";
import {
  PackStructurePane,
  type PackEntryOpenPayload,
} from "@/components/PackStructurePane";
import { FormatDropdown } from "@/components/FormatDropdown";
import { AboutDialog } from "@/components/AboutDialog";
import { Link, useSearch, useNavigate } from "@tanstack/react-router";
import { ConversionConfirmDialog } from "@/components/ConversionConfirmDialog";
import { OverwriteConfirmDialog, type OverwriteChoice } from "@/components/OverwriteConfirmDialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Play, HelpCircle, Activity, Globe, House, Radio, Download, Loader2 } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useProjectStore } from "@/stores/project-store";
import { useSampleEditsStore } from "@/stores/sample-edits-store";
import { useShallow } from "zustand/react/shallow";
import { useWaveformEditorStore } from "@/stores/waveform-editor-store";
import { MultiSampleStack } from "@/components/MultiSampleStack";
import { ExportPackButton } from "@/components/ExportPackButton";
import { AudioPreview } from "@/components/AudioPreview";
import { fileSystemService } from "@/lib/fileSystem";
import type { FileSystemEntry } from "@/lib/fileSystem";
import { toast } from "sonner";
import { UserMenu } from "@/components/UserMenu";
import { DevModeToggle } from "@/components/Header";
import { useFormatPresetStore } from "@/stores/format-preset-store";
import { capture } from "@/lib/analytics";
import { parseBpmFromString, replaceBpmInString } from "@/lib/tempoUtils";
import { hasDirectoryPickerSupport } from "@/lib/browserSupport";
import { isRemotePath } from "@/lib/audio-resolver";
import { ReleaseNotesPanel } from "@/components/ReleaseNotesPanel";
import { RoomsTab } from "@/components/RoomsTab";
import { RoomAvatars } from "@/components/RoomAvatars";
import { UndoRedoButtons } from "@/components/UndoRedoButtons";
import { ProjectMenu } from "@/components/ProjectMenu";
import { LiveToggle } from "@/components/LiveToggle";
import { CacheDebugPanel } from "@/components/CacheDebugPanel";
import { ReleaseTourPointer } from "@/components/ReleaseTourPointer";
import { HomeFooter } from "@/components/HomeFooter";
import { useReleaseTourStore } from "@/stores/release-tour-store";
import { useUnifiedPlayer } from "@/hooks/useUnifiedPlayer";
import { useProjectSync } from "@/hooks/useProjectSync";
import { useRoomStorageSync } from "@/hooks/useRoomStorageSync";
import { usePublicRoomsCount } from "@/hooks/usePublicRoomsCount";
import { usePresenceSync } from "@/hooks/usePresenceSync";
import { usePlayerStore } from "@/stores/player-store";
import { setCurrentPack } from "@/lib/current-pack";
import { useNavigateRequestStore } from "@/stores/navigate-request-store";
import { useCurrentProjectStore } from "@/stores/current-project-store";
import { useFollowListenStore } from "@/stores/follow-listen-store";
import { useFavorites } from "@/hooks/use-favorites";
import { useProjectColumn } from "@/stores/project-column-store";
import {
  deleteProjectPack as deleteLocalProjectPack,
  getProjectLocalPackCoverDisplayUrl,
  listProjectPacks,
  type ProjectLocalPack,
} from "@/lib/project-packs";
import {
  exportLocalPackFolderToFolder,
  exportLocalPackFolderToZip,
  exportProjectPackStructureToFolder,
  exportProjectPackStructureToZip,
} from "@/lib/project-export";

function dirname(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "/";
  }
  return `/${parts.slice(0, -1).join("/")}`;
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

type OctacardTestWindow = Window & {
  __octacardTestHooks?: unknown;
  __octacardPlayerStore?: typeof usePlayerStore;
  __octacardProjectStore?: typeof useProjectStore;
  __octacardWaveformEditorStore?: typeof useWaveformEditorStore;
  __octacardMultiSampleStoreResetStack?: () => void;
};

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
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { openPack?: string; creator?: string };
  const pendingRequest = useNavigateRequestStore((s) => s.pendingRequest);
  const clearRequest = useNavigateRequestStore((s) => s.clearRequest);

  const [aboutOpen, setAboutOpen] = useState(false);
  const [openPackId, setOpenPackId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<"stack" | "pack">("stack");
  const [packEditorRequestedPath, setPackEditorRequestedPath] = useState<string | null>(null);
  const previewMode = useProjectStore((s) => s.getActiveStack()?.previewMode ?? "single");
  const setPreviewMode = useProjectStore((s) => s.setPreviewMode);
  const addSamplesToStack = useProjectStore((s) => s.addSamplesToStack);
  const globalTempoBpm = useProjectStore((s) => s.getActiveStack()?.globalTempoBpm ?? 120);
  const setGlobalTempoBpm = useProjectStore((s) => s.setGlobalTempoBpm);
  const bpmAuto = useProjectStore((s) => s.getActiveStack()?.bpmAuto ?? true);
  const currentEditorName = editorMode === "pack" ? "PACK EDITOR" : previewMode === "multi" ? "STACKS" : "PACK";
  const setBpmAuto = useProjectStore((s) => s.setBpmAuto);
  const [sourcePath, setSourcePath] = useState("");
  const [sourceVolumeId, setSourceVolumeId] = useState("_default");
  const [destPath, setDestPath] = useState("");
  const [destVolumeId, setDestVolumeId] = useState("_default");
  const [requestedSourcePath, setRequestedSourcePath] = useState<string | null>(null);
  const [requestedDestPath, setRequestedDestPath] = useState<string | null>(null);
  const [requestedSourceRevealPath, setRequestedSourceRevealPath] = useState<string | null>(null);
  const [requestedDestRevealPath, setRequestedDestRevealPath] = useState<string | null>(null);
  const [selectedSourceItem, setSelectedSourceItem] = useState<{
    path: string;
    type: "file" | "folder";
    name: string;
  } | null>(null);
  const [selectedDestItem, setSelectedDestItem] = useState<{
    path: string;
    type: "file" | "folder";
    name: string;
  } | null>(null);
  const [sourceRootVersion, setSourceRootVersion] = useState(0);
  const [destRootVersion, setDestRootVersion] = useState(0);
  const [sourceRefreshToken, setSourceRefreshToken] = useState(0);
  const [destRefreshToken, setDestRefreshToken] = useState(0);
  const [libraryMode, setLibraryMode] = useState<"local" | "global">("global");
  const [globalScope, setGlobalScope] = useState<"mine" | "all" | "explore" | "rooms">("all");
  const projectId = useProjectStore((s) => s.id);
  const [localProjectPacks, setLocalProjectPacks] = useState<ProjectLocalPack[]>([]);
  const [localPackEditor, setLocalPackEditor] = useState<LocalPackEditorState | null>(null);
  const [activeLocalPackId, setActiveLocalPackId] = useState<string | null>(null);
  const [exportingLocalPack, setExportingLocalPack] = useState(false);
  const { favorites: sourceLocalFolders, addFavorite, removeFavorite } = useFavorites("source", sourceVolumeId);
  const { globalPacks, addGlobalPack, removeGlobalPack } = useProjectColumn(projectId);
  const activeLocalPack = localProjectPacks.find((pack) => pack.id === activeLocalPackId) ?? null;
  const formatSettings = useFormatPresetStore((s) => s.currentPreset.settings);
  const waveformEditor = useWaveformEditorStore(
    useShallow((s) => ({
      isOpen: s.isOpen,
      enabled: s.enabled,
      filePath: s.filePath,
      fileName: s.fileName,
      paneType: s.paneType,
      isEmptyState: s.isEmptyState,
      multiSampleId: s.multiSampleId,
      close: s.close,
      setEnabled: s.setEnabled,
    })),
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
  const handleBrowseForFolderRef = useRef<(paneType: "source" | "dest", currentPath?: string) => Promise<void>>(
    async () => {},
  );

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

  useProjectSync();
  useRoomStorageSync();
  const publicRoomsCount = usePublicRoomsCount();
  const listeningUserId = useFollowListenStore((s) => s.listeningUserId);
  usePresenceSync(listeningUserId);

  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    if (params.get("release-tour") === "1" || params.get("release-tour") === "true") {
      useReleaseTourStore.getState().loadAndStart();
    }
  }, []);

  // Auto-load project on mount (API when authenticated, localStorage when not) or create default if none
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ok = await useCurrentProjectStore.getState().loadProject();
      if (!ok && !cancelled) {
        // If we have persisted state from localStorage, don't overwrite with new project
        const hasPersisted = useProjectStore.getState().id != null;
        if (!hasPersisted) {
          await useCurrentProjectStore.getState().createAndLoadProject("Untitled");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!projectId) {
      setLocalProjectPacks([]);
      setActiveLocalPackId(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const packs = await listProjectPacks(projectId);
        if (!cancelled) {
          setLocalProjectPacks(packs);
          setActiveLocalPackId((current) => (current && packs.some((pack) => pack.id === current) ? current : null));
        }
      } catch (error) {
        if (!cancelled) {
          toast.error("Failed to load local packs", {
            description: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Handle openPack from URL (e.g. from Admin Queue dashboard)
  useEffect(() => {
    const packId = search?.openPack;
    if (packId) {
      setLibraryMode("global");
      setOpenPackId(packId);
      navigate({ to: "/", search: { creator: search?.creator } });
    }
  }, [search?.openPack, navigate]);

  // When creator filter is in URL, ensure global mode
  useEffect(() => {
    if (search?.creator) {
      setLibraryMode("global");
    }
  }, [search?.creator]);

  // Handle navigation requests from SampleSourceBadge (Cache, Stack)
  // Pack: OK to switch to global (user can always see server)
  // Folder: only navigate when already in local (don't switch to local - user may not have folder access)
  useEffect(() => {
    if (!pendingRequest) return;
    if (pendingRequest.type === "pack") {
      setLibraryMode("global");
      setOpenPackId(pendingRequest.packId);
    } else if (pendingRequest.type === "folder" && libraryMode === "local") {
      if (pendingRequest.paneType === "source") {
        setRequestedSourcePath(pendingRequest.path);
      } else {
        setRequestedDestPath(pendingRequest.path);
      }
    } else if (pendingRequest.type === "selectRoot") {
      setLibraryMode("local");
      void handleBrowseForFolderRef.current(pendingRequest.paneType, "/");
    }
    clearRequest();
  }, [pendingRequest, clearRequest, libraryMode]);

  const tourActive = useReleaseTourStore((s) => s.isActive);
  const requestedDemoPaths = useReleaseTourStore((s) => s.requestedDemoPaths);
  useEffect(() => {
    if (!tourActive || !requestedDemoPaths) return;
    if (!fileSystemService.hasRootForPane("source") || !fileSystemService.hasRootForPane("dest")) return;
    if (requestedDemoPaths.sourcePath) setRequestedSourcePath(requestedDemoPaths.sourcePath);
    if (requestedDemoPaths.destPath) setRequestedDestPath(requestedDemoPaths.destPath);
  }, [tourActive, requestedDemoPaths?.sourcePath, requestedDemoPaths?.destPath, requestedDemoPaths]);

  // Space bar: start whatever was last (multi or single) when idle, stop when playing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      const { isPlaying, mode, singleFile, stack, playSingle, playMulti, stop } = usePlayerStore.getState();
      if (isPlaying) {
        stop();
        return;
      }
      // Prefer waveform editor's current file when open (user may have tapped a new sample)
      const we = useWaveformEditorStore.getState();
      if (we.isOpen && we.filePath && we.paneType && !we.isEmptyState) {
        playSingle(we.filePath, we.paneType);
      } else if (mode === "multi" && stack.length > 0) {
        const multiStack = useProjectStore.getState().getActiveStackStack();
        const hasValidBars = multiStack.some((s) => s.bars != null && s.bars > 0);
        if (multiStack.length > 0 && hasValidBars) {
          playMulti(
            multiStack.map((s) => ({
              id: s.id,
              path: s.path,
              name: s.name,
              paneType: s.paneType,
              bpm: s.bpm,
              duration: s.duration,
            })),
          );
        }
      } else if (mode === "single" && singleFile) {
        playSingle(singleFile.path, singleFile.paneType);
      } else {
        const multiStack = useProjectStore.getState().getActiveStackStack();
        if (multiStack.length > 0) {
          const hasValidBars = multiStack.some((s) => s.bars != null && s.bars > 0);
          if (hasValidBars) {
            playMulti(
              multiStack.map((s) => ({
                id: s.id,
                path: s.path,
                name: s.name,
                paneType: s.paneType,
                bpm: s.bpm,
                duration: s.duration,
              })),
            );
          }
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    const win = typeof window !== "undefined" ? (window as OctacardTestWindow) : null;
    if (win?.__octacardTestHooks) {
      win.__octacardPlayerStore = usePlayerStore;
      win.__octacardProjectStore = useProjectStore;
      win.__octacardWaveformEditorStore = useWaveformEditorStore;
      win.__octacardMultiSampleStoreResetStack = () => {
        useProjectStore.getState().resetActiveStackSlots();
      };
    }
  }, []);

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

  // Open waveform when user taps a remote sample (audition flow)
  useEffect(() => {
    if (
      selectedSourceItem?.type === "file" &&
      isAudioFile(selectedSourceItem.name) &&
      isRemotePath(selectedSourceItem.path)
    ) {
      useWaveformEditorStore.getState().openWithFile(selectedSourceItem.path, selectedSourceItem.name, "source");
    }
  }, [selectedSourceItem]);

  const handleSourcePathChange = useCallback((path: string, volumeId: string) => {
    setSourcePath(path);
    setSourceVolumeId(volumeId);
    if (path && path !== "/") {
      const packName = basename(path) || path.split("/").filter(Boolean).pop() || "Pack";
      setCurrentPack({ name: packName });
    }
  }, []);

  const handleRequestedSourcePathHandled = useCallback(() => setRequestedSourcePath(null), []);
  const handleRequestedSourceRevealPathHandled = useCallback(() => setRequestedSourceRevealPath(null), []);

  const handlePackEntryOpen = useCallback((payload: PackEntryOpenPayload) => {
    if (payload.paneType === "dest") {
      setSelectedDestItem({ path: payload.path, type: "file", name: payload.name });
    } else {
      setSelectedSourceItem({ path: payload.path, type: "file", name: payload.name });
    }
  }, []);

  const handleStartConversion = async () => {
    if (!fileSystemService.hasRootForPane("source") || !fileSystemService.hasRootForPane("dest")) {
      return;
    }
    const sourceSelection = selectedSourceItem ?? {
      path: sourcePath || "/",
      type: "folder" as const,
      name: "",
    };
    const destinationSelectionPath = selectedDestItem?.type === "folder" ? selectedDestItem.path : destPath || "/";

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
        sourceSelection.path !== "/" && !hasSameFolderName ? dirname(sourceSelection.path) : sourceSelection.path;
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
      formatSettings.sampleRate === "dont-change" ? undefined : parseInt(formatSettings.sampleRate, 10);

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
        setConversionProgress((p) => (p ? { ...p, current: i, currentFile: entry.name } : p));

        const sourcePrefix = sourceBasePath === "/" ? "/" : `${sourceBasePath}/`;
        const relativePath = entry.path.startsWith(sourcePrefix) ? entry.path.slice(sourcePrefix.length) : entry.name;
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
            bpmResult = parentFolderName ? parseBpmFromString(parentFolderName) : null;
            tempoFromFolder = !!bpmResult;
          }
        }

        const targetBpm = formatSettings.tempo !== "dont-change" ? parseInt(formatSettings.tempo, 10) : undefined;
        const sourceBpm = bpmResult?.bpm;
        const applyTempo =
          targetBpm != null &&
          Number.isFinite(targetBpm) &&
          sourceBpm != null &&
          formatSettings.tempo !== "dont-change";

        let destDir = dirParts.length ? `${destinationBasePath}/${dirParts.join("/")}` : destinationBasePath;

        if (applyTempo) {
          if (tempoFromFolder && parentFolderName) {
            const updatedDirParts = dirParts.map((p) =>
              p === parentFolderName ? replaceBpmInString(p, sourceBpm, targetBpm) : p,
            );
            destDir =
              updatedDirParts.length > 0 ? `${destinationBasePath}/${updatedDirParts.join("/")}` : destinationBasePath;
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

      setConversionProgress((p) => (p ? { ...p, current: files.length, currentFile: "" } : p));
      setDestRefreshToken((v) => v + 1);
      setPendingConversionRequest(null);
      setTimeout(() => setConversionProgress(null), 500);

      if (errors.length > 0) {
        const failedCount = errors.length;
        const totalCount = files.length;
        toast.error(failedCount === totalCount ? "Conversion Failed" : "Some Files Failed", {
          description:
            failedCount === totalCount
              ? (errors[0]?.error ?? "Unable to convert files.")
              : `${failedCount} of ${totalCount} files failed: ${errors.map((e) => e.name).join(", ")}`,
          duration: 6000,
        });
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
    selection: { reusedExistingRoot: boolean; virtualPath: string },
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
  handleBrowseForFolderRef.current = handleBrowseForFolder;

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
          if (!alreadyAdded)
            toAdd.push({ path: selectedSourceItem.path, name: selectedSourceItem.name, paneType: "source" });
        }
        if (selectedDestItem?.type === "file" && isAudioFile(selectedDestItem.name)) {
          const alreadyAdded = toAdd.some((s) => s.path === selectedDestItem.path);
          if (!alreadyAdded) toAdd.push({ path: selectedDestItem.path, name: selectedDestItem.name, paneType: "dest" });
        }
        if (toAdd.length > 0) {
          useProjectStore.getState().setActiveSlotIndex(0);
          addSamplesToStack(toAdd, 4);
          const active = useProjectStore.getState().getActiveStack();
          const slots = active?.slots ?? [];
          const activeSlotIndex = active?.activeSlotIndex ?? 0;
          const sample = slots[activeSlotIndex];
          if (sample) {
            useWaveformEditorStore
              .getState()
              .openWithFileFromMulti(sample.path, sample.name, sample.paneType, sample.id);
          }
        }
      } else {
        setPreviewMode("single");
      }
    },
    [setPreviewMode, addSamplesToStack, selectedSourceItem, selectedDestItem],
  );

  const handleWaveformToggle = useCallback(() => {
    const we = useWaveformEditorStore.getState();
    if (we.enabled) {
      we.setEnabled(false);
      return;
    }
    we.setEnabled(true);
    if (previewMode === "multi") {
      const active = useProjectStore.getState().getActiveStack();
      const slots = active?.slots ?? [];
      const activeSlotIndex = active?.activeSlotIndex ?? 0;
      const sample = slots[activeSlotIndex];
      if (sample && isAudioFile(sample.name)) {
        we.openWithFileFromMulti(sample.path, sample.name, sample.paneType, sample.id);
        return;
      }
    }
    if (selectedSourceItem?.type === "file" && isAudioFile(selectedSourceItem.name)) {
      we.openWithFile(selectedSourceItem.path, selectedSourceItem.name, "source");
      return;
    }
    if (selectedDestItem?.type === "file" && isAudioFile(selectedDestItem.name)) {
      we.openWithFile(selectedDestItem.path, selectedDestItem.name, "dest");
      return;
    }
    we.open();
  }, [previewMode, selectedSourceItem, selectedDestItem]);

  const handlePickLocalFolderShortcut = useCallback(async () => {
    if (isUnsupportedBrowser()) {
      toast.error("Browser Not Supported", {
        description:
          "OctaCard supports Brave, Chrome, and other Chromium-based browsers (including ChatGPT Atlas). Safari, Firefox, and other non-Chromium browsers are not supported.",
        duration: 8000,
      });
      return;
    }
    if (!fileSystemService.hasRootForPane("source")) {
      toast.error("No library folder", {
        description: "Choose a library folder in Local mode first, then you can pin shortcuts here.",
        duration: 6000,
      });
      return;
    }
    const result = await fileSystemService.pickDirectoryForSourceFavoritePin(sourcePath || undefined);
    if (result.success && result.data) {
      addFavorite(result.data.path, result.data.name);
    } else if (!result.success && result.error !== "User cancelled directory selection") {
      toast.error("Could not add shortcut", {
        description: result.error || "Try again or drag a folder from the file list.",
        duration: 6000,
      });
    }
  }, [addFavorite, sourcePath]);

  const handleBrowseGlobalPacksFromColumn = useCallback(() => {
    setLibraryMode("global");
    setGlobalScope("all");
    if (search?.creator) {
      void navigate({ to: "/", search: {} });
    }
  }, [navigate, search?.creator]);

  const handleCreateProjectPack = useCallback(() => {
    if (!projectId) {
      toast.error("No active project");
      return;
    }
    const nextIndex = localProjectPacks.length + 1;
    setLocalPackEditor({
      mode: "create",
      suggestedName: `Local Pack ${nextIndex}`,
    });
  }, [projectId, localProjectPacks.length]);

  const handleEditProjectPack = useCallback(
    (packId: string) => {
      const pack = localProjectPacks.find((entry) => entry.id === packId);
      if (pack) setLocalPackEditor({ mode: "edit", pack });
    },
    [localProjectPacks],
  );

  const handleLocalPackSaved = useCallback((pack: ProjectLocalPack, saveMode: "create" | "edit") => {
    if (saveMode === "create") {
      setLocalProjectPacks((current) => [pack, ...current]);
      setEditorMode("pack");
      setActiveLocalPackId(pack.id);
      setPackEditorRequestedPath(null);
      setRequestedSourcePath(null);
    } else {
      setLocalProjectPacks((current) => current.map((p) => (p.id === pack.id ? pack : p)));
    }
  }, []);

  const handleOpenProjectPack = useCallback(
    (packId: string) => {
      const pack = localProjectPacks.find((entry) => entry.id === packId);
      if (!pack) return;
      setEditorMode("pack");
      setActiveLocalPackId(pack.id);
      setPackEditorRequestedPath(null);
      setRequestedSourcePath(null);
    },
    [localProjectPacks],
  );

  const handleOpenGlobalProjectPack = useCallback((packId: string) => {
    setLibraryMode("global");
    setOpenPackId(packId);
  }, []);

  /** Open a project-pinned local folder in the source FilePane; does not change editor column mode or selection. */
  const handleOpenProjectLocalFolder = useCallback(async (path: string) => {
    setLibraryMode("local");
    setPackEditorRequestedPath(null);

    if (!fileSystemService.hasRootForPane("source")) {
      // Without a source root, FilePane cannot list the pin path (empty tree + misleading copy).
      await handleBrowseForFolderRef.current("source", path);
      if (fileSystemService.hasRootForPane("source")) {
        setRequestedSourcePath(path);
      }
      return;
    }

    setRequestedSourcePath(path);
  }, []);

  const handleRemoveProjectPack = useCallback(
    async (packId: string) => {
      if (!projectId) return;
      try {
        await deleteLocalProjectPack(projectId, packId);
        setLocalProjectPacks((current) => current.filter((pack) => pack.id !== packId));
        if (activeLocalPackId === packId) {
          setActiveLocalPackId(null);
          setPackEditorRequestedPath(null);
          setEditorMode("stack");
        }
      } catch (error) {
        toast.error("Failed to delete local pack", {
          description: error instanceof Error ? error.message : "Unknown error",
        });
      }
    },
    [projectId, activeLocalPackId],
  );

  const handleExportLocalPackToZip = useCallback(async () => {
    if (!activeLocalPack || !projectId) {
      toast.error("Select a local pack first");
      return;
    }
    setExportingLocalPack(true);
    try {
      const result = activeLocalPack.rootPath
        ? await exportLocalPackFolderToZip(activeLocalPack.name, activeLocalPack.rootPath, "source")
        : await exportProjectPackStructureToZip(projectId, activeLocalPack.id, activeLocalPack.name);
      if (!result.success) {
        toast.error(result.error ?? "Export failed");
        return;
      }
      toast.success(`Downloaded ${result.count ?? 0} files`);
    } finally {
      setExportingLocalPack(false);
    }
  }, [activeLocalPack, projectId]);

  const handleExportLocalPackToFolder = useCallback(async () => {
    if (!activeLocalPack || !projectId) {
      toast.error("Select a local pack first");
      return;
    }

    const pickResult = await fileSystemService.requestDirectoryForPane("dest");
    if (!pickResult.success || !pickResult.data) {
      if (!pickResult.cancelled) {
        toast.error(pickResult.error ?? "No destination selected");
      }
      return;
    }

    const destinationParent = pickResult.data.virtualPath || "/";
    setExportingLocalPack(true);
    try {
      const result = activeLocalPack.rootPath
        ? await exportLocalPackFolderToFolder(
            activeLocalPack.name,
            activeLocalPack.rootPath,
            destinationParent,
            "source",
            "dest",
          )
        : await exportProjectPackStructureToFolder(
            projectId,
            activeLocalPack.id,
            activeLocalPack.name,
            destinationParent,
            "dest",
          );
      if (!result.success) {
        toast.error(result.error ?? "Export failed");
        return;
      }
      toast.success(`Exported ${result.count ?? 0} files to folder`);
    } finally {
      setExportingLocalPack(false);
    }
  }, [activeLocalPack, projectId]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center px-4 shrink-0 gap-4">
        <div className="flex items-center gap-3 shrink-0">
          <ProjectMenu />
          <LiveToggle />
          <Button
            variant={editorMode === "stack" && previewMode === "multi" ? "default" : "outline"}
            size="sm"
            aria-pressed={editorMode === "stack" && previewMode === "multi" ? "true" : "false"}
            aria-label="Multi preview"
            data-testid="multi-mode-toggle"
            onClick={() => {
              setEditorMode("stack");
              handlePreviewModeChange(previewMode === "multi" ? "single" : "multi");
            }}
          >
            Stack
          </Button>
          <Button
            variant={editorMode === "pack" ? "default" : "outline"}
            size="sm"
            aria-pressed={editorMode === "pack" ? "true" : "false"}
            aria-label="Pack editor mode"
            onClick={() => {
              setEditorMode("pack");
              if (sourcePath) {
                setPackEditorRequestedPath(sourcePath);
              }
            }}
          >
            Pack
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={waveformEditor.enabled ? "default" : "outline"}
                size="sm"
                aria-label="Waveform editor"
                aria-pressed={waveformEditor.enabled ? "true" : "false"}
                data-testid="waveform-editor-button"
                onClick={handleWaveformToggle}
              >
                <Activity className="w-4 h-4 mr-1" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Waveform editor panel (⌘E). Tap any sample to open it even when this is off.</p>
            </TooltipContent>
          </Tooltip>
          {editorMode === "pack" && activeLocalPack ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={exportingLocalPack} aria-label="Export local pack">
                  {exportingLocalPack ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {hasDirectoryPickerSupport() && (
                  <DropdownMenuItem onClick={() => void handleExportLocalPackToFolder()} disabled={exportingLocalPack}>
                    Export to folder...
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => void handleExportLocalPackToZip()} disabled={exportingLocalPack}>
                  Download as zip
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : previewMode === "multi" ? (
            <ExportPackButton />
          ) : null}
          <BpmInput
            value={globalTempoBpm}
            onChange={setGlobalTempoBpm}
            bpmAuto={bpmAuto}
            onBpmAutoChange={setBpmAuto}
          />
          <div className="flex items-center rounded-md border border-border overflow-hidden shrink-0">
            <Button
              size="sm"
              variant={libraryMode === "global" ? "secondary" : "ghost"}
              className="rounded-none h-8 px-2.5"
              aria-label="Global library mode"
              onClick={() => setLibraryMode("global")}
              title="Global"
            >
              <Globe className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              variant={libraryMode === "local" ? "secondary" : "ghost"}
              className="rounded-none h-8 px-2.5"
              aria-label="Local files mode"
              onClick={() => setLibraryMode("local")}
              title="Local"
            >
              <House className="w-4 h-4" />
            </Button>
          </div>
          {libraryMode === "global" && (
            <div className="flex items-center rounded-md border border-border overflow-visible shrink-0">
              {search?.creator && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-r-none h-8 px-3 text-xs whitespace-nowrap border-r-0"
                  onClick={() => navigate({ to: "/", search: {} })}
                >
                  View all
                </Button>
              )}
              <Button
                size="sm"
                variant={globalScope === "mine" ? "secondary" : "ghost"}
                className={
                  search?.creator
                    ? "rounded-none h-8 px-3 text-xs whitespace-nowrap"
                    : "rounded-none h-8 px-3 text-xs whitespace-nowrap"
                }
                onClick={() => {
                  setGlobalScope("mine");
                  if (search?.creator) navigate({ to: "/", search: {} });
                }}
              >
                Mine
              </Button>
              <Button
                size="sm"
                variant={globalScope === "all" ? "secondary" : "ghost"}
                className="rounded-none h-8 px-3 text-xs whitespace-nowrap"
                onClick={() => {
                  setGlobalScope("all");
                  if (search?.creator) navigate({ to: "/", search: {} });
                }}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={globalScope === "explore" ? "secondary" : "ghost"}
                className="rounded-none h-8 px-3 text-xs whitespace-nowrap"
                onClick={() => {
                  setGlobalScope("explore");
                  if (search?.creator) navigate({ to: "/", search: {} });
                }}
              >
                Explore
              </Button>
              <Button
                size="sm"
                variant={globalScope === "rooms" ? "secondary" : "ghost"}
                className="rounded-none h-8 px-3 text-xs whitespace-nowrap relative"
                onClick={() => {
                  setGlobalScope("rooms");
                  if (search?.creator) navigate({ to: "/", search: {} });
                }}
                aria-label={`Rooms${publicRoomsCount > 0 ? ` (${publicRoomsCount} available)` : ""}`}
              >
                Rooms
                <Radio className="w-4 h-4 mr-1" />
                {publicRoomsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full border-2 border-card bg-primary px-1 text-[10px] font-medium text-primary-foreground shadow-sm">
                    {publicRoomsCount}
                  </span>
                )}
              </Button>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-[4rem] flex items-center justify-center gap-2" aria-hidden>
          <RoomAvatars />
          <UndoRedoButtons />
        </div>
        {libraryMode !== "global" && (
          <Button onClick={handleStartConversion} className="gap-2 shrink-0" data-testid="convert-button">
            <Play className="w-4 h-4" />
            Convert
          </Button>
        )}
        {libraryMode !== "global" && <div className="flex-1 min-w-0" aria-hidden />}
        <div className="flex items-center gap-2 shrink-0">
          <FormatDropdown />
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            asChild
            aria-label="Help"
          >
            <Link to="/help" onClick={() => capture("octacard_help_clicked", { source: "header" })}>
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
          <DevModeToggle />
          <UserMenu />
        </div>
      </header>

      <ReleaseNotesPanel />

      <CacheDebugPanel />

      <ReleaseTourPointer />

      <LocalPackEditorDialog
        open={localPackEditor !== null}
        onOpenChange={(open) => {
          if (!open) setLocalPackEditor(null);
        }}
        projectId={projectId}
        state={localPackEditor}
        onSaved={handleLocalPackSaved}
      />

      {/* Main Content: Source favorites + source browser + editor */}
      <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
        <ResizablePanelGroup
          orientation="horizontal"
          className="flex-1 min-h-0 min-w-0"
          id="main-layout"
          defaultLayout={{
            "left-fav": 22,
            "source-browser": 38,
            editor: 40,
          }}
        >
          {/* Left: Source Favorites - only this separator affects favorites vs center. Hidden when no FS API. */}
          <ResizablePanel id="left-fav" defaultSize="20%" minSize="10%" maxSize="30%">
            <ProjectColumn
              currentPath={sourcePath}
              projectPacks={localProjectPacks.map((pack) => ({
                id: pack.id,
                name: pack.name,
                coverImageProxyUrl: projectId
                  ? getProjectLocalPackCoverDisplayUrl(projectId, pack)
                  : undefined,
              }))}
              localFolders={sourceLocalFolders}
              globalPacks={globalPacks}
              onCreatePack={handleCreateProjectPack}
              onEditProjectPack={handleEditProjectPack}
              onOpenProjectPack={handleOpenProjectPack}
              onRemoveProjectPack={(packId) => void handleRemoveProjectPack(packId)}
              onOpenGlobalPack={handleOpenGlobalProjectPack}
              onAddGlobalPack={addGlobalPack}
              onRemoveGlobalPack={removeGlobalPack}
              onOpenLocalFolder={handleOpenProjectLocalFolder}
              onAddLocalFolder={addFavorite}
              onRemoveLocalFolder={removeFavorite}
              onPickLocalFolderShortcut={hasDirectoryPickerSupport() ? handlePickLocalFolderShortcut : undefined}
              onBrowseGlobalPacks={handleBrowseGlobalPacksFromColumn}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* Source Browser - center separator only affects source vs dest */}
          <ResizablePanel id="source-browser" defaultSize="30%" minSize="15%">
            <div className="h-full min-h-0" data-testid="panel-source">
              {libraryMode === "global" && globalScope === "rooms" ? (
                <RoomsTab />
              ) : libraryMode === "global" ? (
                <RemoteFilePane
                  key={`source-${sourceRootVersion}`}
                  title={search?.creator ? "Creator's packs" : "Global Library"}
                  scope={globalScope === "rooms" ? "all" : globalScope}
                  onSelectionChange={setSelectedSourceItem}
                  openPackId={openPackId}
                  onOpenPackIdConsumed={() => setOpenPackId(null)}
                  creatorId={search?.creator ?? undefined}
                />
              ) : libraryMode === "local" &&
                (!hasDirectoryPickerSupport() ||
                  requestedSourcePath?.startsWith("temp://") ||
                  (editorMode === "pack" &&
                    !fileSystemService.hasRootForPane("source") &&
                    !(
                      requestedSourcePath &&
                      requestedSourcePath.startsWith("/") &&
                      !requestedSourcePath.startsWith("temp://")
                    ))) ? (
                <TempFilesPane
                  paneName="source"
                  title="Temp Files"
                  onSelectionChange={setSelectedSourceItem}
                  onPathChange={(path) => handleSourcePathChange(path, "_default")}
                  refreshToken={sourceRefreshToken}
                  requestedPath={requestedSourcePath}
                  onRequestedPathHandled={handleRequestedSourcePathHandled}
                />
              ) : (
                <FilePane
                  key={`source-${sourceRootVersion}`}
                  paneName="source"
                  title="Local Files"
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
              )}
            </div>
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* Editor */}
          <ResizablePanel id="editor" defaultSize="40%" minSize="20%">
            <div className="h-full min-h-0 border border-border bg-card flex flex-col" data-testid="panel-editor">
              <div className="px-4 py-3">
                <h2 className="text-sm font-semibold">{currentEditorName}</h2>
              </div>
              <div className="flex-1 min-h-0 overflow-hidden">
                {editorMode === "pack" && projectId && activeLocalPackId ? (
                  <PackStructurePane
                    projectId={projectId}
                    packId={activeLocalPackId}
                    packDisplayName={activeLocalPack?.name ?? "Pack"}
                    onPackEntryOpen={handlePackEntryOpen}
                  />
                ) : editorMode === "pack" ? (
                  <div className="flex h-full items-center justify-center px-6 text-sm text-muted-foreground text-center">
                    Select a pack from Local Packs to edit.
                  </div>
                ) : previewMode === "multi" ? (
                  <MultiSampleStack rootReloadToken={`${sourceRootVersion}:${destRootVersion}`} />
                ) : (
                  <div className="h-full flex items-center justify-center px-6 text-sm text-muted-foreground text-center">
                    Switch to Multi mode to edit and arrange your sample stack.
                  </div>
                )}
              </div>
            </div>
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
      </div>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

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
                <Progress value={(conversionProgress.current / conversionProgress.total) * 100} className="h-2" />
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
                setConversionProgress((p) => (p ? { ...p, currentFile: "Cancelling conversion..." } : p));
              }}
            >
              Cancel Conversion
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <OverwriteConfirmDialog open={overwriteConfirmOpen} onChoice={handleOverwriteChoice} />

      <HomeFooter />
    </div>
  );
};

export default Index;
