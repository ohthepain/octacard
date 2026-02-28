import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  X,
  ZoomIn,
  ZoomOut,
  Gauge,
  RotateCcw,
  Map,
  ChevronDown,
  ChevronUp,
  Mic,
  Square,
  Download,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline";
import MinimapPlugin from "wavesurfer.js/dist/plugins/minimap";
import EnvelopePlugin from "wavesurfer.js/dist/plugins/envelope";
import RecordPlugin from "wavesurfer.js/dist/plugins/record";
import { useSampleEditsStore } from "@/stores/sample-edits-store";
import { exportAudioWithEdits } from "@/lib/exportAudio";
import { fileSystemService } from "@/lib/fileSystem";
import { ExportOverwriteDialog } from "@/components/ExportOverwriteDialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

function createSilentWavDataUrl(durationSeconds: number): string {
  const sampleRate = 44100;
  const numSamples = sampleRate * durationSeconds * 2;
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);
  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples, true);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

interface AudioPreviewProps {
  filePath: string | null;
  fileName: string | null;
  onClose: () => void;
  paneType?: "source" | "dest" | null;
  isEmptyState?: boolean;
  /** Called when a file is saved (export or record) so the file pane can refresh */
  onFileSaved?: (paneType: "source" | "dest") => void;
}

export const AudioPreview = ({
  filePath,
  fileName,
  onClose,
  paneType = "source",
  isEmptyState = false,
  onFileSaved,
}: AudioPreviewProps) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const timelineRef = useRef<TimelinePlugin | null>(null);
  const minimapRef = useRef<MinimapPlugin | null>(null);
  const minimapContainerRef = useRef<HTMLDivElement | null>(null);
  const envelopeRef = useRef<EnvelopePlugin | null>(null);
  const recordPluginRef = useRef<RecordPlugin | null>(null);
  const disableDragSelectionRef = useRef<(() => void) | null>(null);
  const isInitializingRef = useRef<boolean>(false);
  const currentAudioUrlRef = useRef<string>("");

  const [isPlaying, setIsPlaying] = useState(false);
  const [envelopeEnabled, setEnvelopeEnabled] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordPaused, setIsRecordPaused] = useState(false);
  const [exportOverwriteOpen, setExportOverwriteOpen] = useState(false);
  const exportOverwriteResolverRef = useRef<((choice: "abort" | "overwrite") => void) | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const setEdits = useSampleEditsStore((s) => s.setEdits);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [zoom, setZoom] = useState(50);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [normalize, setNormalize] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [waveformHeight, setWaveformHeight] = useState(200);
  const [debouncedWaveformHeight, setDebouncedWaveformHeight] = useState(200);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedWaveformHeight(waveformHeight), 150);
    return () => clearTimeout(t);
  }, [waveformHeight]);
  const heightDragStartRef = useRef<{ y: number; h: number } | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const onFileSavedRef = useRef(onFileSaved);
  onFileSavedRef.current = onFileSaved;
  const [exportFilenameOpen, setExportFilenameOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState("");
  const exportFilenameResolverRef = useRef<((name: string | null) => void) | null>(null);
  const lastRecordedBlobRef = useRef<Blob | null>(null);

  const getExportBlobForEmptyState = useCallback(async (): Promise<Blob | null> => {
    if (lastRecordedBlobRef.current) return lastRecordedBlobRef.current;
    return null;
  }, []);

  // Drag state for zoom and navigation
  const dragStateRef = useRef<{
    isDragging: boolean;
    startY: number;
    startX: number;
    startZoom: number;
    startScroll: number;
    isMinimapDrag: boolean;
    hasMoved: boolean;
  } | null>(null);

  // Handle mouse down on minimap: click=seek, drag=zoom (vertical) + scroll (horizontal)
  const handleMinimapMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!wavesurferRef.current || !minimapContainerRef.current || isLoading) return;
      const rect = minimapContainerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const width = rect.width;
      const currentDuration = wavesurferRef.current.getDuration();
      if (!currentDuration) return;

      const clickTime = (x / width) * currentDuration;
      let startScroll = 0;
      try {
        startScroll = wavesurferRef.current.getScroll();
      } catch {
        /* getScroll may not exist in some versions */
      }

      dragStateRef.current = {
        isDragging: false,
        startY: e.clientY,
        startX: e.clientX,
        startZoom: zoom,
        startScroll,
        isMinimapDrag: true,
        hasMoved: false,
      };

      // Click: seek to position
      wavesurferRef.current.seekTo(clickTime / currentDuration);
      e.preventDefault();
    },
    [zoom, isLoading],
  );

  // Handle mouse down on waveform (for zoom)
  const handleWaveformMouseDown = (e: React.MouseEvent) => {
    if (!wavesurferRef.current || isLoading) return;
    dragStateRef.current = {
      isDragging: false,
      startY: e.clientY,
      startX: e.clientX,
      startZoom: zoom,
      startScroll: 0,
      isMinimapDrag: false,
      hasMoved: false,
    };
  };

  // Get audio file as blob data URL for WaveSurfer
  // WaveSurfer needs to fetch the audio file to generate waveform, so we use blob data URLs
  // which work with Fetch API (unlike custom protocol URLs)
  useEffect(() => {
    if (!filePath || !paneType) {
      if (isEmptyState) {
        // Use minimal silent WAV for empty state so Record plugin has a container
        const silentWav = createSilentWavDataUrl(1);
        setAudioUrl(silentWav);
        setErrorMessage("");
      } else {
        setAudioUrl("");
        setIsLoading(false);
        setErrorMessage("");
      }
      return;
    }
    async function loadAudioUrl() {
      try {
        // Check file size first to avoid loading huge files
        const statsResult = await fileSystemService.getFileStats(filePath!, paneType!);
        if (statsResult.success && statsResult.data) {
          const fileSizeMB = statsResult.data.size / (1024 * 1024);
          // Warn for very large files but still try to load
          if (fileSizeMB > 100) {
            console.warn(`Large file detected: ${fileSizeMB.toFixed(1)}MB. Loading may take a while...`);
          }
        }

        const result = await fileSystemService.getAudioFileBlob(filePath, paneType);

        if (result.success && result.data) {
          console.log("AudioPreview - Got audio blob data URL for file:", filePath);
          setAudioUrl(result.data);
          setErrorMessage("");
        } else {
          console.error("Failed to get audio file blob:", result.error);
          setErrorMessage(result.error || "Failed to get audio file blob");
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error getting audio file blob:", error);
        setErrorMessage(String(error));
        setIsLoading(false);
      }
    }

    loadAudioUrl();
  }, [filePath, paneType, isEmptyState]);

  // Stop playback when file changes
  useEffect(() => {
    return () => {
      // Cleanup: stop and destroy previous instance when filePath changes
      if (wavesurferRef.current) {
        try {
          try {
            wavesurferRef.current.pause();
          } catch (e) {
            // Ignore errors when pausing
          }
          try {
            wavesurferRef.current.destroy();
          } catch (error) {
            // Ignore AbortError - it's expected when switching files
            if (error.name !== "AbortError" && !error.message?.includes("aborted")) {
              console.error("Error cleaning up WaveSurfer:", error);
            }
          }
        } catch (error) {
          // Ignore AbortError during cleanup
          if (error.name !== "AbortError" && !error.message?.includes("aborted")) {
            console.error("Error cleaning up WaveSurfer:", error);
          }
        }
        wavesurferRef.current = null;
        regionsRef.current = null;
        timelineRef.current = null;
        minimapRef.current = null;
      }
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    };
  }, [filePath]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;
    
    // Prevent multiple simultaneous initializations
    if (isInitializingRef.current) {
      console.log("WaveSurfer initialization already in progress, skipping...");
      return;
    }
    
    // Prevent re-initializing with the same audioUrl
    if (currentAudioUrlRef.current === audioUrl && wavesurferRef.current) {
      console.log("WaveSurfer already initialized with this audioUrl, skipping...");
      return;
    }

    let cancelled = false;
    isInitializingRef.current = true;
    currentAudioUrlRef.current = audioUrl;

    // Clean up previous instance and wait for it to complete
    const cleanupPrevious = async () => {
      if (wavesurferRef.current) {
        try {
          const prevInstance = wavesurferRef.current;
          wavesurferRef.current = null; // Clear ref immediately to prevent race conditions
          
          try {
            prevInstance.pause();
          } catch (e) {
            // Ignore pause errors
          }
          
          try {
            // Destroy and wait a bit for cleanup
            prevInstance.destroy();
            // Give time for audio context to close
            await new Promise((resolve) => setTimeout(resolve, 50));
          } catch (error) {
            // Ignore AbortError during cleanup
            if (error.name !== "AbortError" && !error.message?.includes("aborted")) {
              console.error("Error destroying previous WaveSurfer:", error);
            }
          }
        } catch (error) {
          // Ignore cleanup errors
          if (error.name !== "AbortError" && !error.message?.includes("aborted")) {
            console.error("Error in cleanup:", error);
          }
        }
      }
    };

    const initializeWaveSurfer = async () => {
      await cleanupPrevious();
      
      if (cancelled) return;

      setIsLoading(true);
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);

      // Use MediaElement backend to avoid audio context issues
      // MediaElement backend is more stable and doesn't create multiple audio contexts/streams
      // This prevents the "Number of opened output audio streams exceed the max" error

      // Create WaveSurfer instance - entire waveform in darker grey (no progress color)
      const wavesurfer = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: "#9E9E9E", // Darker grey waveform
        progressColor: "#9E9E9E", // Same grey (no orange to left of playhead)
        cursorColor: "#757575", // Slightly darker for cursor
        barWidth: 2,
        barRadius: 3,
        barGap: 1,
        height: debouncedWaveformHeight,
        normalize: normalize,
        backend: "MediaElement", // Use MediaElement to avoid audio context/stream issues
        mediaControls: false,
        interact: true,
      });

      wavesurferRef.current = wavesurfer;

      // Add Regions plugin
      const regions = RegionsPlugin.create();
      regionsRef.current = regions;
      wavesurfer.registerPlugin(regions);

      // Add Envelope plugin (always registered; shown/active when envelopeEnabled)
      const envelope = EnvelopePlugin.create({
        volume: 1,
        points: [
          { time: 0, volume: 1 },
          { time: 1, volume: 1 },
        ],
      });
      envelopeRef.current = envelope;
      wavesurfer.registerPlugin(envelope);

      // Add Record plugin
      const recordPlugin = RecordPlugin.create({
        renderRecordedAudio: true,
        scrollingWaveform: true,
      });
      recordPluginRef.current = recordPlugin;
      wavesurfer.registerPlugin(recordPlugin);
      recordPlugin.on("record-end", async (blob: Blob) => {
        if (cancelled) return;
        setIsRecording(false);
        setIsRecordPaused(false);
        lastRecordedBlobRef.current = blob;
        if (filePath && paneType) {
          try {
            const dirPath = filePath.substring(0, filePath.lastIndexOf("/")) || "/";
            const baseName = filePath.substring(filePath.lastIndexOf("/") + 1);
            const nameWithoutExt = baseName.replace(/\.[^.]+$/, "");
            const newName = `${nameWithoutExt}_recorded_${Date.now()}.wav`;
            const file = new File([blob], newName, { type: "audio/wav" });
            const result = await fileSystemService.addFileFromDrop(file, dirPath, paneType);
            if (result.success) {
              toast.success(`Recorded and saved: ${newName}`);
              onFileSavedRef.current?.(paneType);
            } else {
              toast.error(result.error || "Failed to save recording");
            }
          } catch (err) {
            toast.error(String(err));
          }
        } else {
          toast.success("Recording complete. Use Export to save.");
        }
      });

      // Add Timeline plugin
      const timeline = TimelinePlugin.create({
        height: 20,
        insertPosition: "beforebegin",
        timeInterval: 0.2,
        primaryLabelInterval: 5,
        secondaryLabelInterval: 1,
        style: {
          fontSize: "10px",
          color: "#B0B0B0", // Light grey text (Ableton style)
        },
      });
      timelineRef.current = timeline;
      wavesurfer.registerPlugin(timeline);

      // Add Minimap plugin
      const minimap = MinimapPlugin.create({
        height: 40,
        insertPosition: "afterend",
        waveColor: "#9E9E9E",
        progressColor: "#9E9E9E",
      });
      minimapRef.current = minimap;
      wavesurfer.registerPlugin(minimap);

      // Event listeners
      wavesurfer.on("ready", () => {
        if (cancelled) {
          console.log("WaveSurfer ready but cancelled, ignoring...");
          return;
        }
        console.log("WaveSurfer ready");
        isInitializingRef.current = false;
        const dur = wavesurfer.getDuration();
        setDuration(dur);
        setIsLoading(false);
        setErrorMessage("");

        // Update envelope points to span full duration
        if (envelopeRef.current && dur > 0) {
          const pts = envelopeRef.current.getPoints();
          if (pts.length >= 2) {
            envelopeRef.current.setPoints([
              { time: 0, volume: pts[0]?.volume ?? 1 },
              { time: dur, volume: pts[pts.length - 1]?.volume ?? 1 },
            ]);
          }
        }

        // Set initial zoom
        wavesurfer.zoom(zoom);
      });

      wavesurfer.on("play", () => {
        if (!cancelled) setIsPlaying(true);
      });

      wavesurfer.on("pause", () => {
        if (!cancelled) setIsPlaying(false);
      });

      wavesurfer.on("finish", () => {
        if (!cancelled) setIsPlaying(false);
      });

      wavesurfer.on("timeupdate", (time) => {
        if (!cancelled) setCurrentTime(time);
      });

      wavesurfer.on("error", (error) => {
        if (cancelled) return;
        isInitializingRef.current = false;
        // Ignore AbortError - it's expected when switching files or destroying WaveSurfer
        if (error.name === "AbortError" || error.message?.includes("aborted")) {
          console.log("WaveSurfer load aborted (expected when switching files)");
          return;
        }
        console.error("WaveSurfer error:", error);
        setErrorMessage(`Failed to load audio: ${error.message || "Unknown error"}`);
        setIsLoading(false);
      });

      wavesurfer.on("loading", (percent) => {
        if (cancelled) return;
        // Ignore Infinity% which can occur when loading is aborted
        if (isFinite(percent)) {
          console.log("Loading:", percent + "%");
        }
      });

      // Sync region changes to store
      regions.on("region-updated", (region) => {
        if (cancelled) return;
        const pts = envelope.getPoints();
        setEdits(filePath, {
          region: { start: region.start, end: region.end },
          envelopePoints: pts.length > 0 ? pts : undefined,
        });
      });
      regions.on("region-removed", () => {
        if (cancelled) return;
        const pts = envelope.getPoints();
        setEdits(filePath, {
          region: null,
          envelopePoints: pts.length > 0 ? pts : undefined,
        });
      });

      // Sync envelope changes to store
      envelope.on("points-change", (newPoints) => {
        if (cancelled) return;
        const regs = regions.getRegions();
        const r = regs[0];
        setEdits(filePath, {
          region: r ? { start: r.start, end: r.end } : undefined,
          envelopePoints: newPoints.length > 0 ? newPoints : undefined,
        });
      });

      // Load audio - wrap in try-catch to handle potential promise rejections
      try {
        wavesurfer.load(audioUrl).catch((error) => {
          if (cancelled) return;
          isInitializingRef.current = false;
          // Ignore AbortError - it's expected when switching files
          if (error.name !== "AbortError" && !error.message?.includes("aborted")) {
            console.error("WaveSurfer load promise rejected:", error);
          }
        });
      } catch (error) {
        if (cancelled) return;
        isInitializingRef.current = false;
        // Ignore AbortError during load
        if (error.name !== "AbortError" && !error.message?.includes("aborted")) {
          console.error("Error loading audio in WaveSurfer:", error);
        }
      }
    };

    // Initialize asynchronously
    initializeWaveSurfer();

    // Cleanup
    return () => {
      cancelled = true;
      isInitializingRef.current = false;
      // Cleanup will be handled by cleanupPrevious function
      // But also ensure refs are cleared
      try {
        // Remove minimap event listener if attached
        if (minimapContainerRef.current) {
          minimapContainerRef.current.removeEventListener("mousedown", handleMinimapMouseDown);
          minimapContainerRef.current = null;
        }
        if (wavesurferRef.current) {
          const instance = wavesurferRef.current;
          wavesurferRef.current = null;
          try {
            instance.pause();
          } catch (e) {
            // Ignore errors when pausing
          }
          try {
            instance.destroy();
          } catch (e) {
            // Ignore AbortError and other cleanup errors
            if (e.name !== "AbortError" && !e.message?.includes("aborted")) {
              console.error("Error destroying WaveSurfer:", e);
            }
          }
        }
      } catch (error) {
        // Ignore AbortError during cleanup
        if (error.name !== "AbortError" && !error.message?.includes("aborted")) {
          console.error("Error cleaning up WaveSurfer in effect:", error);
        }
      }
      regionsRef.current = null;
      timelineRef.current = null;
      minimapRef.current = null;
      envelopeRef.current = null;
      recordPluginRef.current = null;
      if (disableDragSelectionRef.current) {
        disableDragSelectionRef.current();
        disableDragSelectionRef.current = null;
      }
      setIsPlaying(false);
    };
  }, [audioUrl, normalize, fileName, filePath, setEdits, debouncedWaveformHeight]);

  // Effect to find and attach handler to minimap element after it's created
  useEffect(() => {
    if (isLoading || !duration) return;

    // Find the minimap element (inserted after waveform by WaveSurfer with part="minimap")
    const findMinimap = () => {
      if (waveformRef.current) {
        // Try next sibling first (insertPosition: afterend)
        let minimapElement =
          (waveformRef.current.nextElementSibling as HTMLElement) ||
          (waveformRef.current.parentElement?.querySelector('[part="minimap"]') as HTMLElement);
        if (minimapElement) {
          if (minimapContainerRef.current !== minimapElement) {
            if (minimapContainerRef.current) {
              minimapContainerRef.current.removeEventListener("mousedown", handleMinimapMouseDown);
            }
            minimapContainerRef.current = minimapElement;
            minimapElement.style.cursor = "crosshair";
            minimapElement.addEventListener("mousedown", handleMinimapMouseDown);
          }
          return true;
        }
      }
      return false;
    };

    if (!findMinimap()) {
      const timeout = setTimeout(findMinimap, 100);
      const timeout2 = setTimeout(findMinimap, 500);
      return () => {
        clearTimeout(timeout);
        clearTimeout(timeout2);
        if (minimapContainerRef.current) {
          minimapContainerRef.current.removeEventListener("mousedown", handleMinimapMouseDown);
          minimapContainerRef.current = null;
        }
      };
    }

    return () => {
      if (minimapContainerRef.current) {
        minimapContainerRef.current.removeEventListener("mousedown", handleMinimapMouseDown);
        minimapContainerRef.current = null;
      }
    };
  }, [isLoading, duration, handleMinimapMouseDown]);

  // Update zoom
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.zoom(zoom);
    }
  }, [zoom]);

  // Update playback rate
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate]);

  // Update volume
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.setVolume(volume);
    }
  }, [volume]);

  // Sync region drag selection with envelope toggle
  useEffect(() => {
    if (!regionsRef.current || isLoading) return;

    // Clean up previous
    if (disableDragSelectionRef.current) {
      disableDragSelectionRef.current();
      disableDragSelectionRef.current = null;
    }

    if (!envelopeEnabled) {
      const disable = regionsRef.current.enableDragSelection({
        color: "rgba(255, 118, 77, 0.3)",
        drag: true,
        resize: true,
      });
      disableDragSelectionRef.current = disable;
    }
  }, [envelopeEnabled, isLoading]);

  const handleStopOrPlay = useCallback(() => {
    if (!wavesurferRef.current || isLoading) return;
    if (isPlaying) {
      wavesurferRef.current.pause();
      if (duration > 0) {
        wavesurferRef.current.seekTo(playStartTimeRef.current / duration);
      }
    } else {
      playStartTimeRef.current = wavesurferRef.current.getCurrentTime();
      wavesurferRef.current.play();
    }
  }, [isPlaying, isLoading, duration]);

  // Spacebar to start/stop playback (stop resets to position when play was pressed)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) return;
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      handleStopOrPlay();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleStopOrPlay]);

  const skipBackward = () => {
    if (!wavesurferRef.current) return;
    const current = wavesurferRef.current.getCurrentTime();
    wavesurferRef.current.seekTo(Math.max(0, current - 10) / duration);
  };

  const skipForward = () => {
    if (!wavesurferRef.current) return;
    const current = wavesurferRef.current.getCurrentTime();
    wavesurferRef.current.seekTo(Math.min(duration, current + 10) / duration);
  };

  const handleSeek = (value: number[]) => {
    if (!wavesurferRef.current) return;
    wavesurferRef.current.seekTo(value[0] / duration);
  };

  const handleZoomIn = () => {
    setZoom((prev) => Math.min(500, prev + 10));
  };

  const handleZoomOut = () => {
    setZoom((prev) => Math.max(0, prev - 10));
  };

  const handleZoomChange = (value: number[]) => {
    setZoom(value[0]);
  };

  const handlePlaybackRateChange = (value: number[]) => {
    setPlaybackRate(value[0]);
  };

  const addMarker = () => {
    if (!wavesurferRef.current || !regionsRef.current) return;
    const currentTime = wavesurferRef.current.getCurrentTime();
    // Create a small region as a marker (0.1 second wide)
    const marker = regionsRef.current.addRegion({
      start: currentTime,
      end: Math.min(duration, currentTime + 0.1),
      color: "#FF764D", // Orange marker (Ableton orange)
      drag: true,
      resize: false,
      content: `Marker: ${formatTime(currentTime)}`,
    });

    marker.on("update-end", () => {
      console.log("Marker updated:", marker.start);
    });
  };

  const addRegion = () => {
    if (!wavesurferRef.current || !regionsRef.current) return;
    const currentTime = wavesurferRef.current.getCurrentTime();
    const region = regionsRef.current.addRegion({
      start: currentTime,
      end: Math.min(duration, currentTime + 5),
      color: "#FF764D4D", // Orange region with transparency (Ableton orange, ~30% opacity)
      drag: true,
      resize: true,
    });

    region.on("update-end", () => {
      console.log("Region updated:", region.start, region.end);
    });
  };

  const clearRegions = () => {
    if (!regionsRef.current) return;
    regionsRef.current.clearRegions();
  };

  const clearMarkers = () => {
    if (!regionsRef.current) return;
    // Clear all small regions (markers are regions < 0.2 seconds)
    const regions = regionsRef.current.getRegions();
    regions.forEach((region) => {
      if (region.end - region.start < 0.2) {
        region.remove();
      }
    });
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleExport = async () => {
    if (isExporting) return;
    if (isEmptyState || !filePath || !paneType) {
      setExportFilename("recording.wav");
      setExportFilenameOpen(true);
      const name = await new Promise<string | null>((resolve) => {
        exportFilenameResolverRef.current = resolve;
      });
      setExportFilenameOpen(false);
      if (!name?.trim()) return;
      const blob = await getExportBlobForEmptyState();
      if (!blob) {
        toast.error("No audio to export. Record or load a file first.");
        return;
      }
      const safeName = name.trim().replace(/\.wav$/i, "") + ".wav";
      const result = await fileSystemService.addFileFromDrop(
        new File([blob], safeName, { type: "audio/wav" }),
        "/",
        paneType || "source"
      );
      if (result.success) {
        toast.success(`Exported ${safeName}`);
        onFileSaved?.(paneType || "source");
      } else {
        toast.error(result.error || "Export failed");
      }
      return;
    }
    const blobResult = await fileSystemService.getAudioFileBlob(filePath, paneType);
    if (!blobResult.success || !blobResult.data) {
      toast.error(blobResult.error || "Failed to load audio");
      return;
    }
    const blob = await fetch(blobResult.data).then((r) => r.blob());
    const regs = regionsRef.current?.getRegions() ?? [];
    const region = regs[0];
    const regionStart = region?.start ?? 0;
    const regionEnd = region?.end ?? duration;
    const pts = envelopeRef.current?.getPoints() ?? [];
    const envelopePoints = pts.length > 0 ? pts : undefined;

    const statsResult = await fileSystemService.getFileStats(filePath, paneType);
    const willOverwrite = statsResult.success && statsResult.data;

    if (willOverwrite) {
      setExportOverwriteOpen(true);
      const choice = await new Promise<"abort" | "overwrite">((resolve) => {
        exportOverwriteResolverRef.current = resolve;
      });
      if (choice === "abort") return;
    }

    setIsExporting(true);
    try {
      const exported = await exportAudioWithEdits(
        blob,
        { regionStart, regionEnd, envelopePoints },
        duration
      );
      const result = await fileSystemService.writeBlobToPath(filePath, exported, paneType);
      if (result.success) {
        toast.success(`Exported ${fileName}`);
        onFileSaved?.(paneType);
      } else {
        toast.error(result.error || "Export failed");
      }
    } catch (err) {
      toast.error(String(err));
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportOverwriteChoice = (choice: "abort" | "overwrite") => {
    setExportOverwriteOpen(false);
    exportOverwriteResolverRef.current?.(choice);
    exportOverwriteResolverRef.current = null;
  };

  const refreshAudioDevices = async () => {
    try {
      const devices = await RecordPlugin.getAvailableAudioDevices();
      setAudioDevices(devices);
      if (devices.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(devices[0].deviceId);
      }
    } catch {
      setAudioDevices([]);
    }
  };

  const handleStartRecord = async () => {
    const plugin = recordPluginRef.current;
    if (!plugin || !wavesurferRef.current) return;
    try {
      const opts = selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : undefined;
      await plugin.startRecording(opts);
      setIsRecording(true);
      setIsRecordPaused(false);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleStopRecord = async () => {
    const plugin = recordPluginRef.current;
    if (!plugin) return;
    plugin.stopRecording();
  };

  const handlePauseRecord = () => {
    const plugin = recordPluginRef.current;
    if (!plugin) return;
    plugin.pauseRecording();
    setIsRecordPaused(true);
  };

  const handleResumeRecord = () => {
    const plugin = recordPluginRef.current;
    if (!plugin) return;
    plugin.resumeRecording();
    setIsRecordPaused(false);
  };


  // Handle mouse move for drag operations
  useEffect(() => {
    const DRAG_THRESHOLD = 5; // Pixels of movement before considering it a drag

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current || !wavesurferRef.current) return;

      const deltaY = Math.abs(e.clientY - dragStateRef.current.startY);
      const deltaX = Math.abs(e.clientX - dragStateRef.current.startX);
      const hasMovedEnough = dragStateRef.current.isMinimapDrag
        ? deltaX > DRAG_THRESHOLD || deltaY > DRAG_THRESHOLD
        : deltaY > DRAG_THRESHOLD;

      // Mark as dragging once threshold is reached
      if (hasMovedEnough && !dragStateRef.current.isDragging) {
        dragStateRef.current.isDragging = true;
        dragStateRef.current.hasMoved = true;
        // Prevent default behavior once drag is detected
        e.preventDefault();
      }

      // Only perform drag operations if threshold is met
      if (!dragStateRef.current.isDragging) return;

      const currentDuration = wavesurferRef.current.getDuration();

      if (dragStateRef.current.isMinimapDrag) {
        // Minimap: vertical = zoom (up=in, down=out), horizontal = scroll visible area
        const actualDeltaY = e.clientY - dragStateRef.current.startY;
        const actualDeltaX = e.clientX - dragStateRef.current.startX;
        // Vertical: zoom - drag up = zoom in, drag down = zoom out
        const zoomDelta = -actualDeltaY * 0.5;
        const newZoom = Math.max(0, Math.min(500, dragStateRef.current.startZoom + zoomDelta));
        setZoom(newZoom);
        // Horizontal: scroll visible area - drag right = scroll right, drag left = scroll left
        try {
          const ws = wavesurferRef.current;
          if (typeof ws.getScroll === "function" && typeof ws.setScroll === "function") {
            const newScroll = Math.max(0, dragStateRef.current.startScroll + actualDeltaX);
            ws.setScroll(newScroll);
          }
        } catch {
          /* scroll API may not exist */
        }
      } else {
        // Vertical drag on main waveform - zoom in/out
        // Dragging up (negative deltaY) = zoom in
        // Dragging down (positive deltaY) = zoom out
        const actualDeltaY = e.clientY - dragStateRef.current.startY;
        const zoomDelta = -actualDeltaY * 0.5; // Scale factor for zoom sensitivity
        const newZoom = Math.max(0, Math.min(500, dragStateRef.current.startZoom + zoomDelta));
        setZoom(newZoom);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      const state = dragStateRef.current;
      dragStateRef.current = null;
      // If it was a click (no drag) on the main waveform, seek to that position
      if (
        state &&
        !state.hasMoved &&
        !state.isMinimapDrag &&
        waveformRef.current &&
        wavesurferRef.current &&
        !isLoading
      ) {
        const rect = waveformRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        if (width > 0 && x >= 0 && x <= width) {
          const currentDuration = wavesurferRef.current.getDuration();
          if (currentDuration > 0) {
            const seekTime = (x / width) * currentDuration;
            wavesurferRef.current.seekTo(seekTime / currentDuration);
          }
        }
      }
    };

    // Always attach listeners - they'll only fire if dragStateRef.current exists
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startY = e.clientY;
      const startH = waveformHeight;
      heightDragStartRef.current = { y: startY, h: startH };

      const handleMove = (moveE: MouseEvent) => {
        if (!heightDragStartRef.current) return;
        moveE.preventDefault();
        const dy = moveE.clientY - heightDragStartRef.current.y;
        // Drag down = smaller, drag up = bigger (inverted so handle at top behaves intuitively)
        const newH = Math.max(80, Math.min(500, heightDragStartRef.current.h - dy));
        setWaveformHeight(newH);
      };
      const handleUp = () => {
        heightDragStartRef.current = null;
        window.removeEventListener("mousemove", handleMove, true);
        window.removeEventListener("mouseup", handleUp, true);
      };
      // Use capture phase so we receive events before other handlers
      window.addEventListener("mousemove", handleMove, true);
      window.addEventListener("mouseup", handleUp, true);
    },
    [waveformHeight],
  );

  return (
    <div className="border-t border-border bg-card p-4 space-y-3 shrink-0" data-testid={`audio-preview-${paneType}`}>
      {/* Resize handle at very top - drag to adjust waveform height */}
      <div
        className="h-4 w-full cursor-ns-resize flex items-center justify-center hover:bg-muted/50 rounded transition-colors shrink-0 select-none touch-none"
        onMouseDown={handleResizeMouseDown}
        title="Drag to resize"
      >
        <div className="w-12 h-0.5 bg-muted-foreground/40 rounded pointer-events-none" />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            data-testid="audio-preview-filename"
            title={fileName ?? "Waveform Editor"}
            className="block max-w-full text-sm font-semibold uppercase tracking-wide text-muted-foreground truncate"
          >
            {fileName ? `Preview: ${fileName}` : "Waveform Editor"}
          </span>
        </div>
        <Button
          data-testid="audio-preview-close"
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {errorMessage && (
        <div className="p-2 bg-destructive/10 border border-destructive/20 rounded text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      {/* Waveform - resizable height (overflow-hidden to contain minimap) */}
      <div
        className="relative overflow-hidden"
        style={{ minHeight: debouncedWaveformHeight + 60 }}
      >
        <div
          ref={waveformRef}
          className="w-full cursor-pointer"
          style={{ height: debouncedWaveformHeight }}
          onMouseDown={handleWaveformMouseDown}
        />
        {isLoading && !isEmptyState && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {isEmptyState && !audioUrl && (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm">
            Record or load a file to get started
          </div>
        )}
        {/* Playhead overlay with dragger handle - only when we have audio */}
        {!isEmptyState && duration > 0 && (
          <div
            className="absolute top-0 bottom-8 left-0 w-0.5 pointer-events-none z-10"
            style={{
              left: `${(currentTime / duration) * 100}%`,
              backgroundColor: "#FF764D",
            }}
          >
            <div
              className="absolute -top-1 -left-2 w-4 h-3 rounded-sm cursor-ew-resize pointer-events-auto shadow-sm border border-border"
              style={{ backgroundColor: "#FF764D" }}
              onMouseDown={(e) => {
                e.stopPropagation();
                const startX = e.clientX;
                const startTime = currentTime;
                const handleMove = (moveE: MouseEvent) => {
                  const rect = waveformRef.current?.getBoundingClientRect();
                  if (!rect || !wavesurferRef.current) return;
                  const dx = moveE.clientX - startX;
                  const timeDelta = (dx / rect.width) * duration;
                  const newTime = Math.max(0, Math.min(duration, startTime + timeDelta));
                  wavesurferRef.current.seekTo(newTime / duration);
                };
                const handleUp = () => {
                  window.removeEventListener("mousemove", handleMove);
                  window.removeEventListener("mouseup", handleUp);
                };
                window.addEventListener("mousemove", handleMove);
                window.addEventListener("mouseup", handleUp);
              }}
            />
          </div>
        )}
      </div>

      {/* Transport bar: playback, time, volume, zoom, envelope, export, advanced */}
      <div className="relative z-10 flex items-center gap-3 flex-wrap" style={{ minHeight: "2rem" }}>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 shrink-0"
            onClick={skipBackward}
            disabled={isLoading}
          >
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-8 w-8 p-0 shrink-0"
            onClick={handleStopOrPlay}
            disabled={isLoading}
            title={isPlaying ? "Stop (reset to start position)" : "Play"}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Square className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0" onClick={skipForward} disabled={isLoading}>
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>

        {/* Time Display */}
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground font-mono shrink-0"
          style={{ minWidth: "100px" }}
        >
          <span>{formatTime(currentTime)}</span>
          <span>/</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Volume Control */}
        <div className="flex items-center gap-2 shrink-0" style={{ width: "128px", minWidth: "128px" }}>
          <Volume2 className="w-4 h-4 text-muted-foreground shrink-0" />
          <Slider
            value={[volume]}
            max={1}
            step={0.01}
            onValueChange={(value) => setVolume(value[0])}
            className="cursor-pointer"
          />
        </div>

        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleZoomOut} disabled={isLoading}>
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <div className="flex items-center gap-2 w-28">
          <ZoomIn className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <Slider
            value={[zoom]}
            min={0}
            max={500}
            step={10}
            onValueChange={handleZoomChange}
            disabled={isLoading}
            className="cursor-pointer"
          />
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleZoomIn} disabled={isLoading}>
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>

        {/* Envelope */}
        <Button
          size="sm"
          variant={envelopeEnabled ? "default" : "outline"}
          className="h-7 gap-2 shrink-0"
          onClick={() => setEnvelopeEnabled(!envelopeEnabled)}
          disabled={isLoading}
        >
          <Activity className="w-3.5 h-3.5" />
          Envelope
        </Button>

        {/* Export */}
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-2 shrink-0"
          onClick={handleExport}
          disabled={isLoading || isExporting}
        >
          {isExporting ? (
            <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          ) : (
            <Download className="w-3.5 h-3.5" />
          )}
          Export
        </Button>

        {/* Advanced Collapsible Trigger */}
        <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-2 shrink-0">
              {isAdvancedOpen ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Advanced
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Advanced
                </>
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2 w-full basis-full">
            <div className="flex flex-col gap-4">
              <div className="flex items-center gap-4 flex-wrap">
                        {/* Playback Rate */}
                <div className="flex items-center gap-2">
                  <Gauge className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <Slider
                    value={[playbackRate]}
                    min={0.25}
                    max={2}
                    step={0.05}
                    onValueChange={handlePlaybackRateChange}
                    disabled={isLoading}
                    className="cursor-pointer w-24"
                  />
                  <span className="text-xs text-muted-foreground font-mono min-w-[40px]">{playbackRate.toFixed(2)}x</span>
                </div>
                {/* Normalize Toggle */}
                <Button
                  size="sm"
                  variant={normalize ? "default" : "outline"}
                  className="h-7 gap-2"
                  onClick={() => setNormalize(!normalize)}
                  disabled={isLoading}
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Normalize
                </Button>

                {/* Region Controls */}
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addRegion} disabled={isLoading}>
                    Add Region
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={clearRegions} disabled={isLoading}>
                    Clear Regions
                  </Button>
                </div>

                {/* Marker Controls */}
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={addMarker}
                    disabled={isLoading}
                  >
                    <Map className="w-3 h-3" />
                    Add Marker
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={clearMarkers} disabled={isLoading}>
                    Clear Markers
                  </Button>
                </div>
              </div>

              {/* Record Section */}
              <div className="flex flex-col gap-2 pt-2 border-t border-border">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Mic className="w-3.5 h-3.5" />
                  Record
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={refreshAudioDevices}
                  >
                    Refresh devices
                  </Button>
                  {audioDevices.length > 0 && (
                    <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
                      <SelectTrigger className="h-7 w-[200px]">
                        <SelectValue placeholder="Select input device" />
                      </SelectTrigger>
                      <SelectContent>
                        {audioDevices.map((d) => (
                          <SelectItem key={d.deviceId} value={d.deviceId}>
                            {d.label || `Device ${d.deviceId.slice(0, 8)}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {!isRecording ? (
                    <Button size="sm" variant="default" className="h-7 gap-1" onClick={handleStartRecord}>
                      <Mic className="w-3 h-3" />
                      Record
                    </Button>
                  ) : (
                    <>
                      <Button size="sm" variant="secondary" className="h-7 gap-1" onClick={handleStopRecord}>
                        <Square className="w-3 h-3" />
                        Stop
                      </Button>
                      {isRecordPaused ? (
                        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={handleResumeRecord}>
                          Record
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className="h-7 gap-1" onClick={handlePauseRecord}>
                          Pause
                        </Button>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <ExportOverwriteDialog
        open={exportOverwriteOpen}
        fileName={fileName ?? "file"}
        onChoice={handleExportOverwriteChoice}
      />

      {/* Export filename prompt for empty state */}
      <Dialog
        open={exportFilenameOpen}
        onOpenChange={(open) => {
          if (!open) {
            exportFilenameResolverRef.current?.(null);
            exportFilenameResolverRef.current = null;
            setExportFilename("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export As</DialogTitle>
            <DialogDescription>Enter a filename for the exported audio.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="export-filename">Filename</Label>
              <Input
                id="export-filename"
                value={exportFilename}
                onChange={(e) => setExportFilename(e.target.value)}
                placeholder="recording.wav"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    exportFilenameResolverRef.current?.(exportFilename.trim() || "recording.wav");
                    exportFilenameResolverRef.current = null;
                    setExportFilenameOpen(false);
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportFilenameOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                exportFilenameResolverRef.current?.(exportFilename.trim() || "recording.wav");
                exportFilenameResolverRef.current = null;
                setExportFilenameOpen(false);
              }}
              disabled={!exportFilename.trim()}
            >
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
