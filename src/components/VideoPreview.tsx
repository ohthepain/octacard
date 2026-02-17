import { useState, useRef, useEffect } from "react";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  X,
  Maximize2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface VideoPreviewProps {
  filePath: string;
  fileName: string;
  onClose: () => void;
  paneType?: "source" | "dest";
}

export const VideoPreview = ({ filePath, fileName, onClose, paneType = "source" }: VideoPreviewProps) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Get video file as blob data URL
  useEffect(() => {
    async function loadVideoUrl() {
      try {
        const { fileSystemService } = await import("@/lib/fileSystem");
        // Check file size first to avoid loading huge files
        const statsResult = await fileSystemService.getFileStats(filePath, paneType);
        if (statsResult.success && statsResult.data) {
          const fileSizeMB = statsResult.data.size / (1024 * 1024);
          // Warn for very large files but still try to load
          if (fileSizeMB > 500) {
            console.warn(`Large video file detected: ${fileSizeMB.toFixed(1)}MB. Loading may take a while...`);
          }
        }

        // For video files, use blob approach for better codec support
        console.log("VideoPreview - Using blob approach for video file");
        const result = await fileSystemService.getVideoFileBlob(filePath, paneType);

        if (result.success && result.data) {
          console.log("VideoPreview - Got video URL/blob for file:", filePath);
          console.log("VideoPreview - Video URL:", result.data);
          setVideoUrl(result.data);
          setErrorMessage("");
        } else {
          console.error("Failed to get video file:", result.error);
          setErrorMessage(result.error || "Failed to get video file");
          setIsLoading(false);
        }
      } catch (error) {
        console.error("Error getting video file blob:", error);
        setErrorMessage(String(error));
        setIsLoading(false);
      }
    }

    loadVideoUrl();
  }, [filePath, paneType]);

  // Cleanup video URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (videoUrl && videoUrl.startsWith("data:")) {
        // Revoke object URL if it was created (though we're using data URLs, not object URLs)
        // Data URLs don't need cleanup, but we'll reset state
        setVideoUrl("");
      }
      setIsPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    };
  }, [filePath, videoUrl]);

  // Video event handlers
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoUrl) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
      setIsLoading(false);
      setErrorMessage("");
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handlePlay = () => {
      setIsPlaying(true);
    };

    const handlePause = () => {
      setIsPlaying(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = () => {
      const error = video.error;
      let errorMessage = "Failed to load video";
      
      if (error) {
        // Map error codes to user-friendly messages
        const errorMessages: Record<number, string> = {
          1: "Video loading aborted",
          2: "Network error while loading video",
          3: "Video decoding error - file may be corrupted or unsupported format",
          4: "Video format not supported - codec may not be available",
        };
        
        errorMessage = errorMessages[error.code] || error.message || `Video error (code: ${error.code})`;
        console.error("Video error:", {
          code: error.code,
          message: error.message,
          videoSrc: video.src,
          videoNetworkState: video.networkState,
          videoReadyState: video.readyState,
          MEDIA_ERR_ABORTED: 1,
          MEDIA_ERR_NETWORK: 2,
          MEDIA_ERR_DECODE: 3,
          MEDIA_ERR_SRC_NOT_SUPPORTED: 4,
        });
      } else {
        console.error("Video error event fired but no error object available");
        console.error("Video state:", {
          src: video.src,
          networkState: video.networkState,
          readyState: video.readyState,
          error: video.error,
        });
      }
      
      setErrorMessage(errorMessage);
      setIsLoading(false);
    };

    const handleLoadedData = () => {
      setIsLoading(false);
    };

    video.addEventListener("loadedmetadata", handleLoadedMetadata);
    video.addEventListener("timeupdate", handleTimeUpdate);
    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("error", handleError);
    video.addEventListener("loadeddata", handleLoadedData);

    // Set initial volume
    video.volume = volume;

    return () => {
      video.removeEventListener("loadedmetadata", handleLoadedMetadata);
      video.removeEventListener("timeupdate", handleTimeUpdate);
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("error", handleError);
      video.removeEventListener("loadeddata", handleLoadedData);
    };
  }, [videoUrl, volume]);

  // Update volume when it changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlayPause = () => {
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
  };

  const skipBackward = () => {
    if (!videoRef.current) return;
    const newTime = Math.max(0, videoRef.current.currentTime - 10);
    videoRef.current.currentTime = newTime;
  };

  const skipForward = () => {
    if (!videoRef.current) return;
    const newTime = Math.min(duration, videoRef.current.currentTime + 10);
    videoRef.current.currentTime = newTime;
  };

  const handleSeek = (value: number[]) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = value[0];
  };

  const toggleFullscreen = () => {
    if (!videoRef.current) return;

    if (!document.fullscreenElement) {
      videoRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error("Error attempting to enable fullscreen:", err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      }).catch((err) => {
        console.error("Error attempting to exit fullscreen:", err);
      });
    }
  };

  // Listen for fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

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

      {/* Video Player */}
      <div className="space-y-2">
        <div className="relative bg-black rounded overflow-hidden aspect-video">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full"
            playsInline
            preload="metadata"
          />
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
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

        {/* Fullscreen Button */}
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 shrink-0"
          onClick={toggleFullscreen}
          disabled={isLoading}
        >
          <Maximize2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

