import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Loader2, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSampleAnalysis, retrySampleAnalysis, type SampleAnalysisResponse } from "@/lib/remote-library";
import { toast } from "sonner";

const ATTRIBUTE_LABELS: Record<string, string> = {
  bpm: "BPM",
  loudness: "Loudness",
  energy: "Energy",
};

const TAXONOMY_LABELS: Record<string, string> = {
  instrument_family: "Family",
  instrument_type: "Type",
  style: "Style",
  descriptor: "Descriptor",
  mood: "Mood",
};

interface SampleAnalysisDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sampleId: string | null;
  sampleName?: string;
}

export function SampleAnalysisDialog({
  open,
  onOpenChange,
  sampleId,
  sampleName,
}: SampleAnalysisDialogProps) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["sample-analysis", sampleId],
    queryFn: () => getSampleAnalysis(sampleId!),
    enabled: open && !!sampleId,
  });
  const retryMutation = useMutation({
    mutationFn: async () => {
      if (!sampleId) return;
      await retrySampleAnalysis(sampleId);
    },
    onSuccess: async () => {
      toast.success("Analysis queued");
      await queryClient.invalidateQueries({ queryKey: ["sample-analysis", sampleId] });
    },
    onError: (err) => {
      toast.error("Failed to re-run analysis", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Analysis results
            {sampleName && (
              <span className="font-normal text-muted-foreground truncate max-w-[180px]" title={sampleName}>
                — {sampleName}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          {isLoading && (
            <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
              Loading analysis…
            </div>
          )}
          {error && (
            <div className="text-sm py-4">
              {String(error).includes("404") ? (
                <p className="text-muted-foreground">
                  No analysis found. This file may not have been uploaded to a pack yet.
                </p>
              ) : (
                <p className="text-destructive">
                  {error instanceof Error ? error.message : "Failed to load analysis"}
                </p>
              )}
            </div>
          )}
          {data && (
            <AnalysisContent
              data={data}
              onRetry={sampleId ? () => retryMutation.mutate() : undefined}
              retrying={retryMutation.isPending}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AnalysisContent({
  data,
  onRetry,
  retrying,
}: {
  data: SampleAnalysisResponse;
  onRetry?: () => void;
  retrying?: boolean;
}) {
  const { analysisStatus, analysisError, durationMs, sampleRate, channels, attributes, taxonomy } = data;

  if (analysisStatus === "PENDING" || analysisStatus === "PROCESSING") {
    return (
      <div className="text-sm text-muted-foreground py-4 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin shrink-0" />
        {analysisStatus === "PENDING" ? "Analysis queued…" : "Analyzing…"}
      </div>
    );
  }

  if (analysisStatus === "FAILED") {
    return (
      <div className="space-y-2">
        <div className="text-sm font-medium text-destructive">Analysis failed (last run)</div>
        {analysisError && <p className="text-sm text-muted-foreground">{analysisError}</p>}
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
            {retrying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Re-run analysis
          </Button>
        )}
      </div>
    );
  }

  const { embeddings = [] } = data;

  return (
    <div className="space-y-4">
      {/* Metadata */}
      {(durationMs != null || sampleRate != null || channels != null) && (
        <div className="flex flex-wrap gap-4 text-sm">
          {durationMs != null && (
            <span>
              <span className="text-muted-foreground">Duration:</span>{" "}
              {(durationMs / 1000).toFixed(2)}s
            </span>
          )}
          {sampleRate != null && (
            <span>
              <span className="text-muted-foreground">Sample rate:</span> {sampleRate} Hz
            </span>
          )}
          {channels != null && (
            <span>
              <span className="text-muted-foreground">Channels:</span> {channels}
            </span>
          )}
        </div>
      )}

      {/* Embeddings */}
      {embeddings.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">Embeddings</div>
          <div className="flex flex-wrap gap-2">
            {embeddings.map((e) => (
              <div
                key={`${e.model}-${e.modelVersion}`}
                className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm"
              >
                <span className="uppercase font-medium">{e.model}</span>
                <span className="text-muted-foreground ml-1">
                  {e.dimensions}-dim
                  {e.modelVersion ? ` (v${e.modelVersion})` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Numeric attributes (BPM, loudness, energy) */}
      {Object.keys(attributes).length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">Attributes</div>
          <div className="flex flex-wrap gap-3">
            {Object.entries(attributes).map(([key, value]) => (
              <div
                key={key}
                className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-sm"
              >
                <span className="text-muted-foreground">
                  {ATTRIBUTE_LABELS[key] ?? key}:
                </span>{" "}
                {key === "bpm" ? value.toFixed(1) : value.toFixed(2)}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Taxonomy (instrument, style, mood, etc.) */}
      {taxonomy.length > 0 && (
        <div>
          <div className="text-sm font-medium mb-2">Classification</div>
          <div className="space-y-2">
            {taxonomy.map(({ attribute, value, confidence }) => (
              <div key={`${attribute}-${value}`} className="flex items-center justify-between gap-4 text-sm">
                <span className="text-muted-foreground">
                  {TAXONOMY_LABELS[attribute] ?? attribute}:
                </span>
                <span className="capitalize">{value}</span>
                <span className="text-muted-foreground text-xs">
                  {Math.round(confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysisStatus === "READY" &&
        Object.keys(attributes).length === 0 &&
        taxonomy.length === 0 && (
          <div className="text-sm text-muted-foreground py-4">
            No attributes or taxonomy data available.
          </div>
        )}
      {analysisStatus === "READY" && onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} disabled={retrying}>
          {retrying && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Re-run analysis
        </Button>
      )}
    </div>
  );
}
