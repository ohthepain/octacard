import { useState, useCallback, useEffect } from "react";
import { FilePane } from "@/components/FilePane";
import { FavoritesColumn } from "@/components/FavoritesColumn";
import { FormatDropdown, type FormatSettings } from "@/components/FormatDropdown";
import { AboutDialog } from "@/components/AboutDialog";
import { ConversionConfirmDialog } from "@/components/ConversionConfirmDialog";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Play, FolderPlus } from "lucide-react";
import { fileSystemService } from "@/lib/fileSystem";
import type { FileSystemEntry } from "@/lib/fileSystem";
import { toast } from "sonner";

function dirname(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length <= 1) {
    return "/";
  }
  return "/" + parts.slice(0, -1).join("/");
}

function isAudioFile(fileName: string): boolean {
  return /\.(wav|aiff|aif|mp3|flac|ogg|m4a|aac|wma)$/i.test(fileName);
}

function isSafari(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent.toLowerCase();
  return ua.includes("safari") && !ua.includes("chrome") && !ua.includes("chromium");
}

const Index = () => {
  const [aboutOpen, setAboutOpen] = useState(false);
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
  const [formatSettings, setFormatSettings] = useState<FormatSettings>({
    fileFormat: "dont-change",
    sampleRate: "dont-change",
    sampleDepth: "dont-change",
    mono: false,
    normalize: false,
    trim: false,
  });
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

  useEffect(() => {
    if (isSafari()) {
      setUnsupportedBrowserDialogOpen(true);
    }
  }, []);

  const handleSourcePathChange = useCallback((path: string, volumeId: string) => {
    setSourcePath(path);
    setSourceVolumeId(volumeId);
  }, []);

  const handleDestPathChange = useCallback((path: string, volumeId: string) => {
    setDestPath(path);
    setDestVolumeId(volumeId);
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

    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      setConversionProgress((p) =>
        p ? { ...p, current: i, currentFile: entry.name } : p
      );

      const sourcePrefix = sourceBasePath === "/" ? "/" : `${sourceBasePath}/`;
      const relativePath = entry.path.startsWith(sourcePrefix)
        ? entry.path.slice(sourcePrefix.length)
        : entry.name;
      const dirParts = relativePath.split("/");
      const fileName = dirParts.pop() || entry.name;
      const destDir = dirParts.length ? `${destinationBasePath}/${dirParts.join("/")}` : destinationBasePath;

      await fileSystemService.convertAndCopyFile(
        entry.path,
        destDir,
        fileName,
        targetSampleRate,
        formatSettings.sampleDepth === "dont-change" ? undefined : formatSettings.sampleDepth,
        formatSettings.fileFormat === "dont-change" ? undefined : formatSettings.fileFormat,
        formatSettings.mono,
        formatSettings.normalize,
        formatSettings.trim,
        "source",
        "dest"
      );
    }

    setConversionProgress((p) =>
      p ? { ...p, current: files.length, currentFile: "" } : p
    );
    setPendingConversionRequest(null);
    setTimeout(() => setConversionProgress(null), 500);
  };

  const handleSelectDirectory = async () => {
    const result = await fileSystemService.requestRootDirectory();
    if (result.success) {
      setSourceRootVersion((v) => v + 1);
      setDestRootVersion((v) => v + 1);
    } else {
      if (isSafari()) {
        toast.error("Safari Not Supported", {
          description: "Safari doesn't support folder browsing. Please use Chrome, Edge, or another Chromium-based browser.",
          duration: 8000,
        });
      } else {
        toast.error("Failed to Select Directory", {
          description: result.error || "Unable to open folder picker. Please try again.",
        });
      }
    }
  };

  const applyBrowseSelection = (
    paneType: "source" | "dest",
    selection: { reusedExistingRoot: boolean; virtualPath: string }
  ) => {
    if (paneType === "source") {
      if (!selection.reusedExistingRoot) {
        setSourceRootVersion((v) => v + 1);
      }
      setRequestedSourceRevealPath(selection.virtualPath);
    } else {
      if (!selection.reusedExistingRoot) {
        setDestRootVersion((v) => v + 1);
      }
      setRequestedDestRevealPath(selection.virtualPath);
    }
  };

  const handleBrowseForFolder = async (paneType: "source" | "dest", currentPath?: string) => {
    const result = await fileSystemService.requestDirectoryForPane(paneType, currentPath);
    if (result.success && result.data) {
      applyBrowseSelection(paneType, result.data);
    } else if (!result.success) {
      if (isSafari()) {
        toast.error("Safari Not Supported", {
          description: "Safari doesn't support folder browsing. Please use Chrome, Edge, or another Chromium-based browser.",
          duration: 8000,
        });
      } else if (result.error !== "User cancelled directory selection") {
        toast.error("Failed to Browse Folder", {
          description: result.error || "Unable to open folder picker. Please try again.",
        });
      }
    }
  };

  const handleBrowseFromFavorite = async (paneType: "source" | "dest", favoritePath: string) => {
    const result = await fileSystemService.requestDirectoryForPane(paneType, favoritePath);
    if (result.success && result.data) {
      applyBrowseSelection(paneType, result.data);
    } else if (!result.success) {
      if (isSafari()) {
        toast.error("Safari Not Supported", {
          description: "Safari doesn't support folder browsing. Please use Chrome, Edge, or another Chromium-based browser.",
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
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
              <span className="text-primary-foreground font-bold text-sm">O</span>
            </div>
            <h1 className="text-xl font-bold tracking-tight">OctaCard</h1>
          </div>
          {!fileSystemService.hasRootDirectory() && (
            <Button variant="outline" size="sm" onClick={handleSelectDirectory} className="gap-2">
              <FolderPlus className="w-4 h-4" />
              Select Directory
            </Button>
          )}
          <FormatDropdown settings={formatSettings} onSettingsChange={setFormatSettings} />
        </div>
        <Button onClick={handleStartConversion} className="gap-2 justify-self-center" data-testid="convert-button">
          <Play className="w-4 h-4" />
          Convert
        </Button>
        <div className="flex items-center gap-2 justify-self-end">
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground"
            onClick={() => setAboutOpen(true)}
          >
            About
          </Button>
        </div>
      </header>

      {/* Main Content: Flat 4-panel layout so favorites and browser dividers are independent */}
      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        <ResizablePanelGroup orientation="horizontal" className="flex-1 min-w-0" id="main-layout">
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
                onRequestedPathHandled={() => setRequestedSourcePath(null)}
                requestedPath={requestedSourcePath}
                onRequestedRevealPathHandled={() => setRequestedSourceRevealPath(null)}
                requestedRevealPath={requestedSourceRevealPath}
                dropMode="navigate"
                sampleRate={formatSettings.sampleRate}
                sampleDepth={formatSettings.sampleDepth}
                fileFormat={formatSettings.fileFormat}
                mono={formatSettings.mono}
                normalize={formatSettings.normalize}
                trimStart={formatSettings.trim}
                convertFiles={false}
                showEjectButton={false}
                showNewFolderButton={false}
                onBrowseForFolder={(path) => handleBrowseForFolder("source", path)}
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
                onRequestedPathHandled={() => setRequestedDestPath(null)}
                requestedPath={requestedDestPath}
                onRequestedRevealPathHandled={() => setRequestedDestRevealPath(null)}
                requestedRevealPath={requestedDestRevealPath}
                dropMode="navigate"
                sampleRate={formatSettings.sampleRate}
                sampleDepth={formatSettings.sampleDepth}
                fileFormat={formatSettings.fileFormat}
                mono={formatSettings.mono}
                normalize={formatSettings.normalize}
                trimStart={formatSettings.trim}
                autoNavigateToCard={true}
                convertFiles={true}
                showEjectButton={true}
                showNewFolderButton={true}
                onBrowseForFolder={(path) => handleBrowseForFolder("dest", path)}
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
      </div>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      <Dialog open={unsupportedBrowserDialogOpen} onOpenChange={setUnsupportedBrowserDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Safari Not Supported</DialogTitle>
            <DialogDescription>
              OctaCard requires the File System Access API, which Safari does not support. Please use Chrome, Edge,
              or another Chromium-based browser.
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
            mono: formatSettings.mono,
            normalize: formatSettings.normalize,
            trimStart: formatSettings.trim,
          }}
        />
      )}

      {conversionProgress?.isVisible && (
        <Dialog open={true} onOpenChange={() => {}}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Converting Files</DialogTitle>
              <DialogDescription>
                {conversionProgress.currentFile && (
                  <div className="mt-2 text-sm text-muted-foreground truncate">
                    {conversionProgress.currentFile}
                  </div>
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
    </div>
  );
};

export default Index;
