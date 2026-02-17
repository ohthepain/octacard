import { useState, useRef, useEffect, useCallback } from "react";
import {
  Play,
  Pause,
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline";
import MinimapPlugin from "wavesurfer.js/dist/plugins/minimap";

interface AudioPreviewProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
  paneType?: "source" | "dest";
}

export const AudioPreview = ({ filePath, fileName, onClose, paneType = "source" }: AudioPreviewProps) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const timelineRef = useRef<TimelinePlugin | null>(null);
  const minimapRef = useRef<MinimapPlugin | null>(null);
  const minimapContainerRef = useRef<HTMLDivElement | null>(null);
  const isInitializingRef = useRef<boolean>(false);
  const currentAudioUrlRef = useRef<string>("");

  const [isPlaying, setIsPlaying] = useState(false);
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

  // Drag state for zoom and navigation
  const dragStateRef = useRef<{
    isDragging: boolean;
    startY: number;
    startX: number;
    startZoom: number;
    startTime: number;
    isMinimapDrag: boolean;
    hasMoved: boolean; // Track if mouse has moved enough to consider it a drag
  } | null>(null);

  // Handle mouse down on minimap (for navigation)
  const handleMinimapMouseDown = useCallback((e: MouseEvent) => {
    if (!wavesurferRef.current || !minimapContainerRef.current || isLoading) return;
    const rect = minimapContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const width = rect.width;
    
    // Calculate time based on click position
    const currentDuration = wavesurferRef.current.getDuration();
    if (!currentDuration) return;
    
    const clickTime = (x / width) * currentDuration;
    
    dragStateRef.current = {
      isDragging: false, // Will be set to true once movement threshold is reached
      startY: e.clientY,
      startX: e.clientX,
      startZoom: zoom,
      startTime: clickTime,
      isMinimapDrag: true,
      hasMoved: false,
    };
    
    // Seek to clicked position immediately (click behavior)
    wavesurferRef.current.seekTo(clickTime / currentDuration);
    e.preventDefault();
  }, [zoom, isLoading]);

  // Handle mouse down on waveform (for zoom)
  const handleWaveformMouseDown = (e: React.MouseEvent) => {
    if (!wavesurferRef.current || isLoading) return;
    dragStateRef.current = {
      isDragging: false, // Will be set to true once movement threshold is reached
      startY: e.clientY,
      startX: e.clientX,
      startZoom: zoom,
      startTime: wavesurferRef.current.getCurrentTime(),
      isMinimapDrag: false,
      hasMoved: false,
    };
    // Don't prevent default - allow normal click behavior unless it becomes a drag
  };

  // Get audio file as blob data URL for WaveSurfer
  // WaveSurfer needs to fetch the audio file to generate waveform, so we use blob data URLs
  // which work with Fetch API (unlike custom protocol URLs)
  useEffect(() => {
    async function loadAudioUrl() {
      try {
        const { fileSystemService } = await import("@/lib/fileSystem");
        
        // Check file size first to avoid loading huge files
        const statsResult = await fileSystemService.getFileStats(filePath, paneType);
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
  }, [filePath]);

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

      // Create WaveSurfer instance with Ableton Live color scheme
      const wavesurfer = WaveSurfer.create({
        container: waveformRef.current,
        waveColor: "#E0E0E0", // Light grey/white waveform (Ableton style)
        progressColor: "#FF764D", // Orange progress (Ableton orange)
        cursorColor: "#FF764D", // Orange cursor (Ableton orange)
        barWidth: 2,
        barRadius: 3,
        barGap: 1,
        height: 100,
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
        waveColor: "#C0C0C0", // Light grey for minimap waveform (Ableton style)
        progressColor: "#FF764D80", // Orange progress with transparency (Ableton orange)
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
        setDuration(wavesurfer.getDuration());
        setIsLoading(false);
        setErrorMessage("");

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
      setIsPlaying(false);
    };
  }, [audioUrl, normalize, fileName]); // Removed handleMinimapMouseDown - it's attached in a separate effect

  // Effect to find and attach handler to minimap element after it's created
  useEffect(() => {
    if (isLoading || !duration) return;

    // Find the minimap element (it's created after the waveform by the plugin)
    const findMinimap = () => {
      if (waveformRef.current) {
        // The minimap is typically the next sibling element
        const minimapElement = waveformRef.current.nextElementSibling as HTMLElement;
        if (minimapElement && minimapElement.querySelector('wave')) {
          // Found the minimap element
          if (minimapContainerRef.current !== minimapElement) {
            // Remove old listener if exists
            if (minimapContainerRef.current) {
              minimapContainerRef.current.removeEventListener("mousedown", handleMinimapMouseDown);
            }
            minimapContainerRef.current = minimapElement;
            minimapElement.style.cursor = "ew-resize";
            minimapElement.addEventListener("mousedown", handleMinimapMouseDown);
          }
          return true;
        }
      }
      return false;
    };

    // Try to find minimap immediately
    if (!findMinimap()) {
      // If not found, try again after a short delay
      const timeout = setTimeout(() => {
        findMinimap();
      }, 200);
      return () => clearTimeout(timeout);
    }

    return () => {
      // Cleanup: remove event listener
      if (minimapContainerRef.current) {
        minimapContainerRef.current.removeEventListener("mousedown", handleMinimapMouseDown);
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

  const togglePlayPause = () => {
    if (!wavesurferRef.current) return;

    if (isPlaying) {
      wavesurferRef.current.pause();
    } else {
      wavesurferRef.current.play();
    }
  };

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

  // Handle mouse move for drag operations
  useEffect(() => {
    const DRAG_THRESHOLD = 5; // Pixels of movement before considering it a drag

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStateRef.current || !wavesurferRef.current) return;

      const deltaY = Math.abs(e.clientY - dragStateRef.current.startY);
      const deltaX = Math.abs(e.clientX - dragStateRef.current.startX);
      const hasMovedEnough = dragStateRef.current.isMinimapDrag 
        ? deltaX > DRAG_THRESHOLD 
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
        // Horizontal drag on minimap - navigate the waveform
        if (minimapContainerRef.current && currentDuration) {
          const rect = minimapContainerRef.current.getBoundingClientRect();
          const width = rect.width;
          const relativeX = (e.clientX - rect.left) / width;
          const newTime = Math.max(0, Math.min(currentDuration, relativeX * currentDuration));
          wavesurferRef.current.seekTo(newTime / currentDuration);
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

    const handleMouseUp = () => {
      dragStateRef.current = null;
    };

    // Always attach listeners - they'll only fire if dragStateRef.current exists
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  return (
    <div className="border-t border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground truncate">
            Preview: {fileName}
          </span>
        </div>
        <Button
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

      {/* Waveform */}
      <div className="space-y-2">
        <div 
          ref={waveformRef} 
          className="w-full cursor-ns-resize" 
          onMouseDown={handleWaveformMouseDown}
        />
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Playback Controls */}
      <div className="flex items-center gap-3 flex-wrap" style={{ minHeight: "2rem" }}>
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
            onClick={togglePlayPause}
            disabled={isLoading}
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
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

        {/* Progress Slider */}
        <div className="flex-1 shrink min-w-0" style={{ minWidth: "150px" }}>
          <Slider
            value={[currentTime]}
            max={duration || 100}
            step={0.1}
            onValueChange={handleSeek}
            disabled={isLoading || duration === 0}
            className="cursor-pointer"
          />
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
      </div>

      {/* Advanced Controls */}
      <div className="flex items-center gap-4 flex-wrap pt-2 border-t border-border">
        {/* Zoom Controls */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={handleZoomOut} disabled={isLoading}>
            <ZoomOut className="w-3.5 h-3.5" />
          </Button>
          <div className="flex items-center gap-2 w-32">
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
        </div>

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

        {/* Advanced Controls Collapsible */}
        <Collapsible open={isAdvancedOpen} onOpenChange={setIsAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 gap-2">
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
          <CollapsibleContent className="pt-2">
            <div className="flex items-center gap-4 flex-wrap">
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
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
};
