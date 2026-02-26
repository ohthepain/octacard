import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { capture } from "@/lib/analytics";
import {
  HelpCircle,
  ChevronRight,
  ArrowLeft,
  FileAudio,
  Music2,
  Gauge,
} from "lucide-react";

const codeClass = "bg-muted px-1.5 py-0.5 rounded text-foreground/90 font-mono text-[0.9em]";

function HelpContent() {
  const [convertOpen, setConvertOpen] = useState(false);
  const [pitchOpen, setPitchOpen] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false);

  const handleTopicExpand = (topic: "convert" | "pitch" | "tempo", open: boolean) => {
    if (open) {
      capture("octacard_help_topic_expanded", { topic });
    }
  };

  const triggerClass =
    "flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left outline-none hover:bg-accent/50 transition-colors group border border-transparent hover:border-border";

  return (
    <div className="space-y-3">
      <Collapsible
        open={convertOpen}
        onOpenChange={(open) => {
          setConvertOpen(open);
          handleTopicExpand("convert", open);
        }}
      >
        <CollapsibleTrigger asChild>
          <button type="button" className={triggerClass}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <FileAudio className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium">Convert</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Format, sample rate, bit depth, mono, normalize, trim
              </p>
            </div>
            <ChevronRight
              className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${convertOpen ? "rotate-90" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-12 mt-2 pl-4 border-l-2 border-muted space-y-3 text-sm text-muted-foreground">
            <p>
              Use the Format dialog to tell the converter how to process files when copying between panes:
            </p>
            <ul className="space-y-1.5">
              <li><strong className="text-foreground">Convert to WAV</strong> — Output as WAV format</li>
              <li><strong className="text-foreground">Sample rate</strong> — 44.1 or 48 kHz</li>
              <li><strong className="text-foreground">16-bit (Sample Depth)</strong> — Bit depth</li>
              <li><strong className="text-foreground">Mono</strong> — Convert to mono</li>
              <li><strong className="text-foreground">Normalized</strong> — Normalize levels</li>
              <li><strong className="text-foreground">Trimmed</strong> — Trim leading/trailing silence</li>
            </ul>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={pitchOpen}
        onOpenChange={(open) => {
          setPitchOpen(open);
          handleTopicExpand("pitch", open);
        }}
      >
        <CollapsibleTrigger asChild>
          <button type="button" className={triggerClass}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Music2 className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium">Pitch</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Transpose samples to C based on note names in filenames
              </p>
            </div>
            <ChevronRight
              className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${pitchOpen ? "rotate-90" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-12 mt-2 pl-4 border-l-2 border-muted space-y-3 text-sm text-muted-foreground">
            <p>
              If you choose <strong className="text-foreground">C</strong> in Format → Pitch and the sample filename contains a note name (e.g. A, Am, C#, Bb, F#m), OctaCard will adjust the pitch to C and rename the file to include C in the name.
            </p>
            <p>
              <strong className="text-foreground">Supported pattern:</strong> Note letters A–G with optional # or b, optionally followed by chord quality (m, min, maj, dim, sus).
            </p>
            <p>
              Examples: <code className={codeClass}>Am_kick.wav</code>, <code className={codeClass}>C#_loop.wav</code>
            </p>
          </div>
        </CollapsibleContent>
      </Collapsible>

      <Collapsible
        open={tempoOpen}
        onOpenChange={(open) => {
          setTempoOpen(open);
          handleTopicExpand("tempo", open);
        }}
      >
        <CollapsibleTrigger asChild>
          <button type="button" className={triggerClass}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gauge className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <span className="font-medium">Tempo</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Detect BPM from paths, adjust tempo, and rename files
              </p>
            </div>
            <ChevronRight
              className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${tempoOpen ? "rotate-90" : ""}`}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="ml-12 mt-2 pl-4 border-l-2 border-muted space-y-4 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground">How tempo detection works</p>
              <p className="mt-1">
                When you select a target tempo in Format → Tempo, OctaCard detects the source BPM from your file paths:
              </p>
              <ol className="list-decimal list-inside mt-2 space-y-1">
                <li>First, it checks the <strong className="text-foreground">filename</strong></li>
                <li>If no BPM is found, it checks the <strong className="text-foreground">immediate parent folder name</strong></li>
              </ol>
              <p className="mt-2">
                Only the immediate parent folder is checked when the filename has no BPM.
              </p>
            </div>

            <div>
              <p className="font-medium text-foreground">Supported BPM patterns</p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Number at start: <code className={codeClass}>120_kick.wav</code></li>
                <li>Preceded by underscore: <code className={codeClass}>kick_120.wav</code></li>
                <li>Followed by bpm or _bpm: <code className={codeClass}>120bpm.wav</code>, <code className={codeClass}>120_bpm.wav</code></li>
                <li>At end before extension: <code className={codeClass}>kick_120.wav</code></li>
              </ul>
            </div>

            <div>
              <p className="font-medium text-foreground">BPM range</p>
              <p>Only BPM values between 50 and 240 are recognized. Numbers outside this range are ignored.</p>
            </div>

            <div>
              <p className="font-medium text-foreground">Renaming</p>
              <p className="mt-1">
                When tempo conversion is applied, the output path is updated to reflect the new BPM:
              </p>
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li><strong className="text-foreground">BPM from filename:</strong> The filename is updated (e.g. <code className={codeClass}>120_kick.wav</code> → <code className={codeClass}>140_kick.wav</code>)</li>
                <li><strong className="text-foreground">BPM from folder:</strong> The folder segment containing the BPM is updated; the filename stays the same</li>
              </ul>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default function Help() {
  useEffect(() => {
    capture("octacard_help_page_viewed", {});
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60 px-4 py-3 flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-10 sm:py-14">
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HelpCircle className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Help</h1>
              <p className="text-muted-foreground mt-0.5">
                Format options and conversion tips for OctaCard
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Use the Format dialog when copying audio files to convert, transpose, or change tempo. Expand each section below for details.
          </p>
        </div>
        <HelpContent />
      </main>
    </div>
  );
}
