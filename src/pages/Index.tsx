import { useState } from "react";
import { SampleLibrary } from "@/components/SampleLibrary";
import { ProjectWorkspace } from "@/components/ProjectWorkspace";
import { Toolbar } from "@/components/Toolbar";
import { AboutDialog } from "@/components/AboutDialog";

const Index = () => {
  const [selectedSample, setSelectedSample] = useState<string | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);

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
        {/* Left Pane - Sample Library */}
        <div className="w-1/3 border-r border-border flex flex-col">
          <SampleLibrary onSelectSample={setSelectedSample} selectedSample={selectedSample} />
        </div>

        {/* Right Pane - Project Workspace */}
        <div className="flex-1 flex flex-col">
          <ProjectWorkspace />
        </div>
      </div>

      {/* About Dialog */}
      <AboutDialog open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
};

export default Index;
