import { useState, useRef, useEffect } from "react";
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
}

export const AudioPreview = ({ filePath, fileName, onClose }: AudioPreviewProps) => {
  const waveformRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  const regionsRef = useRef<RegionsPlugin | null>(null);
  const timelineRef = useRef<TimelinePlugin | null>(null);
  const minimapRef = useRef<MinimapPlugin | null>(null);

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

  // Get audio file as blob data URL for WaveSurfer
  // WaveSurfer needs to fetch the audio file to generate waveform, so we use blob data URLs
  // which work with Fetch API (unlike custom protocol URLs)
  useEffect(() => {
    async function loadAudioUrl() {
      // Set breakpoint here - this function is now a named function for better debugging
      if (!window.electron) {
        console.error("Electron API not available");
        setErrorMessage("Electron API not available");
        setIsLoading(false);
        return;
      }

      try {
        // Check file size first to avoid loading huge files
        const statsResult = await window.electron.fs.getFileStats(filePath);
        if (statsResult.success && statsResult.data) {
          const fileSizeMB = statsResult.data.size / (1024 * 1024);
          // Warn for very large files but still try to load
          if (fileSizeMB > 100) {
            console.warn(`Large file detected: ${fileSizeMB.toFixed(1)}MB. Loading may take a while...`);
          }
        }

        // Set breakpoint here - before IPC call
        const result = await window.electron.fs.getAudioFileBlob(filePath);

        // Set breakpoint here - after IPC call
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

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !audioUrl) return;

    // Clean up previous instance
    if (wavesurferRef.current) {
      wavesurferRef.current.destroy();
    }

    setIsLoading(true);

    // Determine backend based on file extension
    // AIF files may not work well with WebAudio backend, so use MediaElement for them
    // For blob data URLs, WebAudio backend works fine and provides better waveform rendering
    const fileExtension = fileName.toLowerCase().split(".").pop();
    const useMediaElementBackend = fileExtension === "aif" || fileExtension === "aiff";

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
      backend: useMediaElementBackend ? "MediaElement" : "WebAudio",
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
      console.log("WaveSurfer ready");
      setDuration(wavesurfer.getDuration());
      setIsLoading(false);
      setErrorMessage("");

      // Set initial zoom
      wavesurfer.zoom(zoom);
    });

    wavesurfer.on("play", () => {
      setIsPlaying(true);
    });

    wavesurfer.on("pause", () => {
      setIsPlaying(false);
    });

    wavesurfer.on("finish", () => {
      setIsPlaying(false);
    });

    wavesurfer.on("timeupdate", (time) => {
      setCurrentTime(time);
    });

    wavesurfer.on("error", (error) => {
      console.error("WaveSurfer error:", error);
      setErrorMessage(`Failed to load audio: ${error.message || "Unknown error"}`);
      setIsLoading(false);
    });

    wavesurfer.on("loading", (percent) => {
      console.log("Loading:", percent + "%");
    });

    // Load audio
    wavesurfer.load(audioUrl);

    // Cleanup
    return () => {
      wavesurfer.destroy();
      wavesurferRef.current = null;
      regionsRef.current = null;
      timelineRef.current = null;
      minimapRef.current = null;
    };
  }, [audioUrl, normalize, fileName]);

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
        <div ref={waveformRef} className="w-full" />
        {isLoading && (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* Playback Controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={skipBackward} disabled={isLoading}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button size="sm" variant="secondary" className="h-8 w-8 p-0" onClick={togglePlayPause} disabled={isLoading}>
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </Button>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={skipForward} disabled={isLoading}>
            <SkipForward className="w-4 h-4" />
          </Button>
        </div>

        {/* Time Display */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono min-w-[100px]">
          <span>{formatTime(currentTime)}</span>
          <span>/</span>
          <span>{formatTime(duration)}</span>
        </div>

        {/* Progress Slider */}
        <div className="flex-1 min-w-[200px]">
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
        <div className="flex items-center gap-2 w-32">
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
