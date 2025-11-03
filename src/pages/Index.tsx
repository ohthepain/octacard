import { useState } from "react";
import { FileBrowser } from "@/components/FileBrowser";
import { CFCardView } from "@/components/CFCardView";
import { AboutDialog } from "@/components/AboutDialog";
import { SampleFormatDialog } from "@/components/SampleFormatDialog";

const Index = () => {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [sampleFormatOpen, setSampleFormatOpen] = useState(false);
  const [sampleRate, setSampleRate] = useState("44.1");
  const [sampleDepth, setSampleDepth] = useState("dont-change");
  const [mono, setMono] = useState(false);
  const [normalize, setNormalize] = useState(false);

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
        <div className="w-1/2 border-r border-border flex flex-col">
          <FileBrowser onFileTransfer={handleFileTransfer} sampleRate={sampleRate} mono={mono} normalize={normalize} />
        </div>

        {/* Right Pane - CF Card View */}
        <div className="flex-1 flex flex-col">
          <CFCardView onFileTransfer={handleFileTransfer} sampleRate={sampleRate} mono={mono} normalize={normalize} />
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
        mono={mono}
        onMonoChange={setMono}
        normalize={normalize}
        onNormalizeChange={setNormalize}
      />
    </div>
  );
};

export default Index;
