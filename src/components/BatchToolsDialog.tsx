import { useState, useRef } from "react";
import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { analyzeFilenameForNote, calculateBpmRatio } from "@/lib/batch-math";
import { toast } from "sonner";
import { Loader2, Music, Clock, FolderOpen } from "lucide-react";

interface BatchToolsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BatchToolsDialog({ open, onOpenChange }: BatchToolsDialogProps) {
  const [activeTab, setActiveTab] = useState("note-to-c");
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);
  const ffmpegRef = useRef<FFmpeg | null>(null);

  const [targetBpm, setTargetBpm] = useState("174");

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const loadFFmpeg = async () => {
    if (ffmpegRef.current) return ffmpegRef.current;

    const ffmpeg = new FFmpeg();
    addLog("Loading FFmpeg engine...");

    const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";

    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
    });

    ffmpegRef.current = ffmpeg;
    return ffmpeg;
  };

  const probeSampleRate = async (ffmpeg: FFmpeg, inputName: string): Promise<number> => {
    const probeOut = "probe_null.tmp";
    try {
      await ffmpeg.exec(["-i", inputName, "-t", "0.001", "-f", "null", probeOut]);
      const logs = ffmpeg.exec.getLogs();
      const logText = logs.map((l) => (typeof l === "object" && "message" in l ? (l as { message: string }).message : String(l))).join("\n");
      const match = logText.match(/Audio:.*?(\d+)\s*Hz/);
      await ffmpeg.deleteFile(probeOut).catch(() => {});
      return match ? parseInt(match[1], 10) : 44100;
    } catch {
      await ffmpeg.deleteFile(probeOut).catch(() => {});
      return 44100;
    }
  };

  const processFiles = async (mode: "NOTE" | "BPM") => {
    try {
      if (typeof window.showDirectoryPicker !== "function") {
        toast.error("Folder picker not supported. Use Chrome, Edge, or Opera.");
        return;
      }
      const dirHandle = await window.showDirectoryPicker();

      setProcessing(true);
      setLogs([]);
      setProgress(0);

      const ffmpeg = await loadFFmpeg();

      const files: { name: string; handle: FileSystemFileHandle }[] = [];

      for await (const entry of dirHandle.values()) {
        if (entry.kind === "file" && /\.(wav|aif|aiff)$/i.test(entry.name)) {
          files.push({ name: entry.name, handle: entry as FileSystemFileHandle });
        }
      }

      addLog(`Found ${files.length} audio files.`);

      for (let i = 0; i < files.length; i++) {
        const fileEntry = files[i];
        const file = await fileEntry.handle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        const inputName = `input_${i}.wav`;
        const outputName = `output_${i}.wav`;

        let ratio = 1;
        let shouldProcess = false;
        let newFilename = "";

        if (mode === "NOTE") {
          const analysis = analyzeFilenameForNote(file.name);
          if (analysis && analysis.semitonesDownToC !== 0) {
            ratio = 1 / analysis.speedRatio;
            newFilename = file.name.replace(analysis.originalString, "C");
            shouldProcess = true;
            addLog(`[${file.name}] Detected ${analysis.note}. Shifting to C...`);
          } else {
            addLog(`[${file.name}] No valid note or already C. Skipping.`);
          }
        } else if (mode === "BPM") {
          const folderName = dirHandle.name;
          const sourceBpm = parseInt(folderName.match(/\d+/)?.[0] ?? "0", 10);

          if (sourceBpm > 0) {
            const tgt = parseInt(targetBpm, 10);
            if (!Number.isNaN(tgt) && tgt > 0) {
              ratio = calculateBpmRatio(sourceBpm, tgt);
              newFilename = file.name.replace(sourceBpm.toString(), "");
              if (newFilename === file.name) newFilename = `processed_${file.name}`;
              shouldProcess = true;
              addLog(`[${file.name}] ${sourceBpm} -> ${tgt} BPM.`);
            } else {
              addLog(`[${file.name}] Invalid target BPM. Skipping.`);
            }
          } else {
            addLog(`Could not determine source BPM from folder name "${folderName}"`);
          }
        }

        if (shouldProcess) {
          await ffmpeg.writeFile(inputName, new Uint8Array(arrayBuffer));

          const inputRate = await probeSampleRate(ffmpeg, inputName);
          if (inputRate !== 44100) {
            addLog(`[${file.name}] Detected ${inputRate} Hz, using for varispeed.`);
          }

          try {
            await ffmpeg.exec([
              "-i",
              inputName,
              "-af",
              `asetrate=${inputRate}*${ratio},aresample=44100`,
              "-acodec",
              "pcm_s16le",
              "-ar",
              "44100",
              "-f",
              "wav",
              "-y",
              outputName,
            ]);
          } catch (execErr) {
            const logs = ffmpeg.exec.getLogs();
            const logText = logs.map((l) => (typeof l === "object" && "message" in l ? (l as { message: string }).message : String(l))).join("\n");
            addLog(`FFmpeg error for ${file.name}: ${execErr}`);
            addLog(logText.slice(-500));
            throw execErr;
          }

          const data = await ffmpeg.readFile(outputName);

          try {
            const newFileHandle = await dirHandle.getFileHandle(newFilename, {
              create: true,
            });
            const writable = await newFileHandle.createWritable();
            await writable.write(data as BufferSource);
            await writable.close();
            addLog(`Saved: ${newFilename}`);
          } catch (e) {
            addLog(`Error saving ${newFilename}: ${e}`);
          }

          await ffmpeg.deleteFile(inputName);
          await ffmpeg.deleteFile(outputName);
        }

        setProgress(((i + 1) / files.length) * 100);
      }

      toast.success("Batch processing complete!");
    } catch (err) {
      if (String(err).includes("AbortError") || (err as Error).name === "AbortError") {
        addLog("Folder selection cancelled.");
      } else {
        console.error(err);
        addLog("Error: " + String(err));
        toast.error("Batch processing failed");
      }
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Batch Audio Tools</DialogTitle>
          <DialogDescription>
            Process folder contents using note-normalization and BPM resampling via FFmpeg.wasm.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="note-to-c">Note Normalizer (to C)</TabsTrigger>
            <TabsTrigger value="bpm-resampler">BPM Resampler</TabsTrigger>
          </TabsList>

          <div className="flex-1 py-4 space-y-4">
            <TabsContent value="note-to-c" className="space-y-4">
              <div className="rounded-md bg-muted p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Music className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">Pitch Shift to C</h3>
                </div>
                <p className="text-sm text-muted-foreground">
                  Scans filenames for notes (e.g., &quot;Synth_F#m.wav&quot;), calculates the offset to C, and
                  slows down/speeds up the audio (Varispeed) to match C.
                </p>
              </div>
              <Button onClick={() => processFiles("NOTE")} disabled={processing} className="w-full">
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="mr-2 h-4 w-4" />
                )}
                Select Folder & Process
              </Button>
            </TabsContent>

            <TabsContent value="bpm-resampler" className="space-y-4">
              <div className="rounded-md bg-muted p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Clock className="w-5 h-5 text-primary" />
                  <h3 className="font-semibold">BPM Resampler</h3>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Reads source BPM from the <strong>Folder Name</strong> (e.g., folder &quot;170&quot;)
                  and resamples audio to match Target BPM.
                </p>
                <div className="flex items-center gap-4">
                  <Label htmlFor="bpm">Target BPM</Label>
                  <Input
                    id="bpm"
                    type="number"
                    value={targetBpm}
                    onChange={(e) => setTargetBpm(e.target.value)}
                    className="w-24"
                  />
                </div>
              </div>
              <Button onClick={() => processFiles("BPM")} disabled={processing} className="w-full">
                {processing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <FolderOpen className="mr-2 h-4 w-4" />
                )}
                Select Folder & Process
              </Button>
            </TabsContent>
          </div>
        </Tabs>

        <div className="border rounded-md bg-black/90 p-2 h-32 flex flex-col gap-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
            <span>Processing Log</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
          <ScrollArea className="flex-1">
            <div className="text-xs font-mono text-green-400 space-y-1">
              {logs.map((log, i) => (
                <div key={i}>{log}</div>
              ))}
              {logs.length === 0 && (
                <span className="text-muted-foreground opacity-50">Waiting to start...</span>
              )}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
