import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { capture } from "@/lib/analytics";
import { HelpCircle, ChevronRight, ArrowLeft } from "lucide-react";

function FormatHelpContent() {
  const [convertOpen, setConvertOpen] = useState(false);
  const [pitchOpen, setPitchOpen] = useState(false);
  const [tempoOpen, setTempoOpen] = useState(false);

  const handleTopicExpand = (topic: "convert" | "pitch" | "tempo", open: boolean) => {
    if (open) {
      capture("octacard_help_topic_expanded", { topic });
    }
  };

  const triggerClass =
    "flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium outline-none hover:bg-accent hover:text-accent-foreground text-left transition-colors";

  return (
    <div className="space-y-2">
      <Collapsible
        open={convertOpen}
        onOpenChange={(open) => {
          setConvertOpen(open);
          handleTopicExpand("convert", open);
        }}
      >
        <CollapsibleTrigger asChild>
          <button type="button" className={triggerClass}>
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform ${convertOpen ? "rotate-90" : ""}`}
            />
            Convert
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pl-7 pr-3 py-3 text-sm text-muted-foreground space-y-2 border-l-2 border-muted ml-2">
            <p>You can tell the converter how to process files when copying:</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Convert to WAV</strong> — Output as WAV format</li>
              <li><strong>Sample rate</strong> — 44.1 or 48 kHz</li>
              <li><strong>16-bit (Sample Depth)</strong> — Bit depth</li>
              <li><strong>Mono</strong> — Convert to mono</li>
              <li><strong>Normalized</strong> — Normalize levels</li>
              <li><strong>Trimmed</strong> — Trim leading/trailing silence</li>
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
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform ${pitchOpen ? "rotate-90" : ""}`}
            />
            Pitch
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pl-7 pr-3 py-3 text-sm text-muted-foreground space-y-2 border-l-2 border-muted ml-2">
            <p>
              If you choose <strong>C</strong> and the sample filename contains a note name (e.g. A, Am, C#, Bb, F#m),
              OctaCard will adjust the pitch to C and rename the file to include C in the name.
            </p>
            <p>
              Supported pattern: note letters A–G with optional # or b, optionally followed by chord quality (m, min, maj, dim, sus).
              Examples: <code className="bg-muted px-1.5 py-0.5 rounded">Am_kick.wav</code>, <code className="bg-muted px-1.5 py-0.5 rounded">C#_loop.wav</code>
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
            <ChevronRight
              className={`h-4 w-4 shrink-0 transition-transform ${tempoOpen ? "rotate-90" : ""}`}
            />
            Tempo
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="pl-7 pr-3 py-3 text-sm text-muted-foreground space-y-2 border-l-2 border-muted ml-2">
            <p>
              If you select a tempo, OctaCard detects the source BPM from filenames or the immediate parent folder name, then adjusts tempo and renames files.
            </p>
            <p className="font-medium text-foreground">File/folder matching patterns:</p>
            <ul className="list-disc list-inside space-y-1">
              <li>Number at start: <code className="bg-muted px-1.5 py-0.5 rounded">120_kick.wav</code></li>
              <li>Preceded by underscore: <code className="bg-muted px-1.5 py-0.5 rounded">kick_120.wav</code></li>
              <li>Followed by bpm or _bpm: <code className="bg-muted px-1.5 py-0.5 rounded">120bpm.wav</code>, <code className="bg-muted px-1.5 py-0.5 rounded">120_bpm.wav</code></li>
              <li>At end before extension: <code className="bg-muted px-1.5 py-0.5 rounded">kick_120.wav</code></li>
            </ul>
            <p>BPM range: 50–240. If no BPM in filename, the parent folder is checked.</p>
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
      <header className="border-b border-border px-4 py-3 flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
      </header>
      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="flex items-center gap-3 mb-8">
          <HelpCircle className="h-8 w-8 text-muted-foreground" />
          <div>
            <h1 className="text-2xl font-semibold">Format options help</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              How to use the Format dropdown when copying audio files
            </p>
          </div>
        </div>
        <FormatHelpContent />
      </main>
    </div>
  );
}
