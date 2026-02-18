import { useState, useCallback } from "react";
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

const Index = () => {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sourcePath, setSourcePath] = useState("");
  const [sourceVolumeId, setSourceVolumeId] = useState("_default");
  const [destPath, setDestPath] = useState("");
  const [destVolumeId, setDestVolumeId] = useState("_default");
  const [requestedSourcePath, setRequestedSourcePath] = useState<string | null>(null);
  const [requestedDestPath, setRequestedDestPath] = useState<string | null>(null);
  const [requestedSourceRevealPath, setRequestedSourceRevealPath] = useState<string | null>(null);
  const [requestedDestRevealPath, setRequestedDestRevealPath] = useState<string | null>(null);
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
  const [pendingConversionFiles, setPendingConversionFiles] = useState<FileSystemEntry[] | null>(null);

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
    const srcPath = sourcePath || "/";
    const result = await fileSystemService.listAudioFilesRecursively(srcPath, "source");
    if (!result.success || !result.data) {
      return;
    }
    const files = result.data;
    if (files.length === 0) {
      return;
    }
    setPendingConversionFiles(files);
    setConversionConfirmOpen(true);
  };

  const handleConversionConfirm = async () => {
    setConversionConfirmOpen(false);
    const files = pendingConversionFiles;
    if (!files || files.length === 0) return;
    const srcPath = sourcePath || "/";
    const dstPath = destPath || "/";

    const targetSampleRate =
      formatSettings.sampleRate === "dont-change"
        ? undefined
        : parseInt(formatSettings.sampleRate, 10);

    setConversionProgress({
      isVisible: true,
      current: 0,
      total: files.length,
      currentFile: "",
    });

    for (let i = 0; i < files.length; i++) {
      const entry = files[i];
      setConversionProgress((p) =>
        p ? { ...p, current: i, currentFile: entry.name } : p
      );

      const relativePath = srcPath === "/"
        ? entry.path.slice(1)
        : entry.path.slice(srcPath.length + 1);
      const dirParts = relativePath.split("/");
      const fileName = dirParts.pop()!;
      const destDir = dirParts.length ? `${dstPath}/${dirParts.join("/")}` : dstPath;

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
    setPendingConversionFiles(null);
    setTimeout(() => setConversionProgress(null), 500);
  };

  const handleSelectDirectory = async () => {
    const result = await fileSystemService.requestRootDirectory();
    if (result.success) {
      setSourceRootVersion((v) => v + 1);
      setDestRootVersion((v) => v + 1);
    }
  };

  const handleBrowseForFolder = async (paneType: "source" | "dest") => {
    const result = await fileSystemService.requestDirectoryForPane(paneType);
    if (result.success && result.data) {
      if (paneType === "source") {
        if (!result.data.reusedExistingRoot) {
          setSourceRootVersion((v) => v + 1);
        }
        setRequestedSourceRevealPath(result.data.virtualPath);
      } else {
        if (!result.data.reusedExistingRoot) {
          setDestRootVersion((v) => v + 1);
        }
        setRequestedDestRevealPath(result.data.virtualPath);
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center px-4 justify-between shrink-0">
        <div className="flex items-center gap-4">
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
        <div className="flex items-center gap-2">
          <Button onClick={handleStartConversion} className="gap-2">
            <Play className="w-4 h-4" />
            Convert
          </Button>
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
          <ResizablePanel id="left-fav" defaultSize={240} minSize={10} maxSize={320}>
            <FavoritesColumn
              paneType="source"
              volumeId={sourceVolumeId}
              currentPath={sourcePath}
              onNavigate={setRequestedSourcePath}
              title="Source Favorites"
            />
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* Source Browser - center separator only affects source vs dest */}
          <ResizablePanel id="source-browser" defaultSize={35} minSize={15}>
            <FilePane
              key={`source-${sourceRootVersion}`}
              paneName="source"
              title="Source"
              showSidebar={false}
              onPathChange={handleSourcePathChange}
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
              onBrowseForFolder={() => handleBrowseForFolder("source")}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* Dest Browser - center separator only affects source vs dest */}
          <ResizablePanel id="dest-browser" defaultSize={35} minSize={15}>
            <FilePane
              key={`dest-${destRootVersion}`}
              paneName="dest"
              title="Destination"
              onFileTransfer={handleFileTransfer}
              showSidebar={false}
              onPathChange={handleDestPathChange}
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
              onBrowseForFolder={() => handleBrowseForFolder("dest")}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />

          {/* Right: Dest Favorites - only this separator affects favorites vs center */}
          <ResizablePanel id="right-fav" defaultSize={240} minSize={10} maxSize={320}>
            <FavoritesColumn
              paneType="dest"
              volumeId={destVolumeId}
              currentPath={destPath}
              onNavigate={(path) => setRequestedDestPath(path)}
              title="Dest Favorites"
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      {pendingConversionFiles && (
        <ConversionConfirmDialog
          open={conversionConfirmOpen}
          onOpenChange={(open) => {
            setConversionConfirmOpen(open);
            if (!open) setPendingConversionFiles(null);
          }}
          onConfirm={handleConversionConfirm}
          fileCount={pendingConversionFiles.length}
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
