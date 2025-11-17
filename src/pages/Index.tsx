import { useState } from "react";
import { FilePane } from "@/components/FilePane";
import { AboutDialog } from "@/components/AboutDialog";
import { SampleFormatDialog } from "@/components/SampleFormatDialog";

const Index = () => {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sampleFormatOpen, setSampleFormatOpen] = useState(false);
  const [sampleRate, setSampleRate] = useState("44.1");
  const [sampleDepth, setSampleDepth] = useState("16-bit");
  const [fileFormat, setFileFormat] = useState("WAV");
  const [mono, setMono] = useState(false);
  const [normalize, setNormalize] = useState(false);
  const [trimStart, setTrimStart] = useState(false);

  const handleFileTransfer = (sourcePath: string, destinationPath: string) => {
    console.log("File transfer requested:", { sourcePath, destinationPath });
    // TODO: Implement file conversion and transfer logic
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header
        className="h-14 border-b border-border bg-card flex items-center px-4 justify-between"
        style={{ WebkitAppRegion: "drag" }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">O</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">OctaCard</h1>
        </div>
        <div className="flex items-center gap-4" style={{ WebkitAppRegion: "no-drag" }}>
          <button
            onClick={() => setSampleFormatOpen(true)}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            Format
          </button>
          <button
            onClick={() => setAboutOpen(true)}
            className="text-muted-foreground hover:text-foreground text-sm transition-colors"
          >
            About
          </button>
        </div>
      </header>

      {/* Main Content - 2 Pane Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane - File Browser (Local) */}
        <div className="w-1/2 border-r border-border flex flex-col min-w-0">
          <FilePane
            paneName="local"
            title="Local Files"
            onFileTransfer={handleFileTransfer}
            sampleRate={sampleRate}
            sampleDepth={sampleDepth}
            fileFormat={fileFormat}
            mono={mono}
            normalize={normalize}
            trimStart={trimStart}
            autoNavigateToCard={false}
            convertFiles={false}
            showEjectButton={false}
            showNewFolderButton={true}
          />
        </div>

        {/* Right Pane - CF Card View */}
        <div className="flex-1 flex flex-col min-w-0">
          <FilePane
            paneName="cfcard"
            title="CF Card"
            onFileTransfer={handleFileTransfer}
            sampleRate={sampleRate}
            sampleDepth={sampleDepth}
            fileFormat={fileFormat}
            mono={mono}
            normalize={normalize}
            trimStart={trimStart}
            autoNavigateToCard={true}
            convertFiles={true}
            showEjectButton={true}
            showNewFolderButton={true}
          />
        </div>
      </div>

      {/* About Dialog */}
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />

      {/* Sample Format Dialog */}
      <SampleFormatDialog
        open={sampleFormatOpen}
        onOpenChange={setSampleFormatOpen}
        sampleRate={sampleRate}
        onSampleRateChange={setSampleRate}
        sampleDepth={sampleDepth}
        onSampleDepthChange={setSampleDepth}
        fileFormat={fileFormat}
        onFileFormatChange={setFileFormat}
        mono={mono}
        onMonoChange={setMono}
        normalize={normalize}
        onNormalizeChange={setNormalize}
        trimStart={trimStart}
        onTrimStartChange={setTrimStart}
      />
    </div>
  );
};

export default Index;
