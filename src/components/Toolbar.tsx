import { FolderOpen, RefreshCw, Link2, Download, GitCompare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export const Toolbar = () => {
  const { toast } = useToast();

  const handleAction = (action: string) => {
    toast({
      title: `${action} triggered`,
      description: "This feature will be implemented with Electron backend",
    });
  };

  return (
    <div className="h-12 bg-toolbar border-b border-border px-4 flex items-center gap-2">
      <Button
        variant="secondary"
        size="sm"
        className="gap-2"
        onClick={() => handleAction("Import Samples")}
      >
        <FolderOpen className="w-4 h-4" />
        Import Samples
      </Button>
      
      <Button
        variant="secondary"
        size="sm"
        className="gap-2"
        onClick={() => handleAction("Convert & Normalize")}
      >
        <RefreshCw className="w-4 h-4" />
        Convert & Normalize
      </Button>
      
      <Button
        variant="secondary"
        size="sm"
        className="gap-2"
        onClick={() => handleAction("Build Chain")}
      >
        <Link2 className="w-4 h-4" />
        Build Chain
      </Button>
      
      <div className="flex-1" />
      
      <Button
        variant="secondary"
        size="sm"
        className="gap-2"
        onClick={() => handleAction("Compare Changes")}
      >
        <GitCompare className="w-4 h-4" />
        Compare Changes
      </Button>
      
      <Button
        variant="default"
        size="sm"
        className="gap-2"
        onClick={() => handleAction("Export to CF")}
      >
        <Download className="w-4 h-4" />
        Export to CF
      </Button>
    </div>
  );
};
