import { useState } from "react";
import { FileBrowser } from "@/components/FileBrowser";
import { CFCardView } from "@/components/CFCardView";
import { Toolbar } from "@/components/Toolbar";
import { AboutDialog } from "@/components/AboutDialog";

const Index = () => {
  const [aboutOpen, setAboutOpen] = useState(false);

  const handleFileTransfer = (sourcePath: string, destinationPath: string) => {
    console.log("File transfer requested:", { sourcePath, destinationPath });
    // TODO: Implement file conversion and transfer logic
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border bg-card flex items-center px-4 justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded flex items-center justify-center">
            <span className="text-primary-foreground font-bold text-sm">O</span>
          </div>
          <h1 className="text-xl font-bold tracking-tight">OctaCard</h1>
        </div>
        <button
          onClick={() => setAboutOpen(true)}
          className="text-muted-foreground hover:text-foreground text-sm transition-colors"
        >
          About
        </button>
      </header>

      {/* Toolbar */}
      <Toolbar />

      {/* Main Content - 2 Pane Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Pane - File Browser (Local) */}
        <div className="w-1/2 border-r border-border flex flex-col">
          <FileBrowser onFileTransfer={handleFileTransfer} />
        </div>

        {/* Right Pane - CF Card View */}
        <div className="flex-1 flex flex-col">
          <CFCardView onFileTransfer={handleFileTransfer} />
        </div>
      </div>

      {/* About Dialog */}
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
};

export default Index;
