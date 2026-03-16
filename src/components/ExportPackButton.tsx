/**
 * Export pack from current project. Uses FS API folder picker when available, else zip download.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCurrentProjectStore } from "@/stores/current-project-store";
import { useProjectStore } from "@/stores/project-store";
import { exportProjectPack, exportProjectPackToZip, type PackExportConfig } from "@/lib/project-export";
import { hasDirectoryPickerSupport } from "@/lib/browserSupport";
import { fileSystemService } from "@/lib/fileSystem";

export function ExportPackButton() {
  const [exporting, setExporting] = useState(false);
  const getProjectDocument = useCurrentProjectStore((s) => s.getProjectDocument);
  const projectName = useProjectStore((s) => s.name);
  const slots = useProjectStore((s) => s.getActiveStack()?.slots ?? []);
  const stack = slots.filter((s): s is NonNullable<typeof s> => s != null);

  const defaultPackSettings: PackExportConfig = {
    packId: "export",
    name: projectName ?? "Untitled",
    includeSamples: [],
    includeStacks: true,
  };

  const handleExportToFolder = async () => {
    const project = getProjectDocument();
    if (!project || stack.length === 0) {
      toast.error("No samples in stack to export");
      return;
    }

    const pickResult = await fileSystemService.requestDirectoryForPane("dest");
    if (!pickResult.success || !pickResult.data) {
      if (pickResult.cancelled) return;
      toast.error(pickResult.error ?? "No folder selected");
      return;
    }

    const basePath = pickResult.data.virtualPath === "/" ? "" : pickResult.data.virtualPath;
    const destPath = basePath ? `${basePath}/${defaultPackSettings.name}` : `/${defaultPackSettings.name}`;

    setExporting(true);
    try {
      const result = await exportProjectPack(project, defaultPackSettings, {
        destinationPath: destPath,
        paneType: "dest",
        useFolderPicker: false,
      });
      if (result.success) {
        toast.success("Pack exported to folder");
      } else {
        toast.error(result.error ?? "Export failed");
      }
    } finally {
      setExporting(false);
    }
  };

  const handleExportToZip = async () => {
    const project = getProjectDocument();
    if (!project || stack.length === 0) {
      toast.error("No samples in stack to export");
      return;
    }

    setExporting(true);
    try {
      const result = await exportProjectPackToZip(
        project,
        defaultPackSettings,
        defaultPackSettings.name,
      );
      if (result.success) {
        toast.success("Pack downloaded as zip");
      } else {
        toast.error(result.error ?? "Export failed");
      }
    } finally {
      setExporting(false);
    }
  };

  if (stack.length === 0) return null;

  const hasFs = hasDirectoryPickerSupport();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={exporting} aria-label="Export pack">
          {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {hasFs && (
          <DropdownMenuItem onClick={handleExportToFolder} disabled={exporting}>
            Export to folder...
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleExportToZip} disabled={exporting}>
          Download as zip
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
