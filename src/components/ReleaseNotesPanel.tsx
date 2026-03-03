import { ChevronLeft, ChevronRight, X, ExternalLink, Pointer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useReleaseTourStore } from "@/stores/release-tour-store";
import { getFeatures } from "@/lib/releaseNotes";

const VIBE_CODING_URL = "/vibe-coding-rules.html";

export function ReleaseNotesPanel() {
  const {
    isActive,
    notes,
    steps,
    releases,
    currentReleaseIndex,
    currentFeatureIndex,
    showMeStepIndex,
    nextRelease,
    prevRelease,
    nextFeature,
    prevFeature,
    showMe,
    skip,
  } = useReleaseTourStore();

  if (!isActive || !notes || steps.length === 0) return null;

  const features = getFeatures(notes);
  const currentFeature = features[currentFeatureIndex];
  if (!currentFeature) return null;

  const featureSteps = steps.filter((s) => s.featureId === currentFeature.id);
  const isFirstFeature = currentFeatureIndex === 0;
  const isLastFeature = currentFeatureIndex === features.length - 1;
  const isFirstRelease = currentReleaseIndex === 0;
  const isLastRelease = currentReleaseIndex === releases.length - 1;

  return (
    <div
      className="border-b border-border bg-card px-4 py-3 shrink-0"
      data-testid="release-notes-panel"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-center mb-2">What&apos;s new</h2>
          <div className="flex items-center justify-center gap-2 mb-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={prevRelease}
              disabled={isFirstRelease}
              aria-label="Previous release"
              className="h-7 w-7"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground w-16 text-center">v{notes.version}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={nextRelease}
              disabled={isLastRelease}
              aria-label="Next release"
              className="h-7 w-7"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={prevFeature}
              disabled={isFirstFeature}
              aria-label="Previous feature"
              className="h-7 w-7 shrink-0"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <h3 className="text-sm font-medium text-foreground flex-1 min-w-0">{currentFeature.title}</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={nextFeature}
              disabled={isLastFeature}
              aria-label="Next feature"
              className="shrink-0 h-7 text-xs gap-0.5"
            >
              Next
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
          {currentFeature.description && (
            <p className="text-sm text-muted-foreground mb-2">{currentFeature.description}</p>
          )}
          <ul className="space-y-1.5 pl-6">
            {featureSteps.map((step) => {
              const globalStepIndex = steps.findIndex(
                (s) => s.featureId === currentFeature.id && s.stepIndex === step.stepIndex
              );
              const hasHighlight = !!step.instruction.highlight;
              const isShowMeActive = showMeStepIndex === globalStepIndex;
              return (
                <li key={`${step.featureId}-${step.stepIndex}`} className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground flex-1 min-w-0">{step.instruction.text}</span>
                  {hasHighlight && (
                    <Button
                      variant={isShowMeActive ? "secondary" : "outline"}
                      size="sm"
                      className="shrink-0 h-7 text-xs"
                      onClick={() => showMe(globalStepIndex)}
                    >
                      <Pointer className="w-3 h-3 mr-1" />
                      Show me
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={skip}
          aria-label="Dismiss"
          className="shrink-0 text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 mt-3 pt-3 border-t border-border">
        <Button variant="outline" size="sm" asChild>
          <a href={VIBE_CODING_URL} target="_blank" rel="noopener noreferrer" className="gap-1">
            <ExternalLink className="w-3 h-3" />
            Request improvement
          </a>
        </Button>
      </div>
    </div>
  );
}
