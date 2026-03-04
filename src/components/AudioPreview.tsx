import { useState, useRef, useEffect, useCallback, useMemo } from "react";
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
  Map as MapIcon,
  ChevronDown,
  ChevronUp,
  Layers,
  Mic,
  Square,
  Download,
  Activity,
  Trash2,
  GripVertical,
  GripHorizontal,
  Repeat,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import WaveSurfer from "wavesurfer.js";
import RegionsPlugin from "wavesurfer.js/dist/plugins/regions";
import TimelinePlugin from "wavesurfer.js/dist/plugins/timeline";
import MinimapPlugin from "wavesurfer.js/dist/plugins/minimap";
import EnvelopePlugin from "wavesurfer.js/dist/plugins/envelope";
import RecordPlugin from "wavesurfer.js/dist/plugins/record";
import { useSampleEditsStore } from "@/stores/sample-edits-store";
import { useMultiSampleStore } from "@/stores/multi-sample-store";
import { usePlayerStore } from "@/stores/player-store";
import { useWaveformEditorStore } from "@/stores/waveform-editor-store";
import { useAppOptionsStore } from "@/stores/app-options-store";
import {
  exportAudioWithEdits,
  mixOverdub,
  replaceSegment,
  parseWavCueMarkers,
  parseWavMetadata,
  getAudioFileInfo,
  formatBytes,
  type AudioFileInfo,
} from "@/lib/exportAudio";
import { fileSystemService } from "@/lib/fileSystem";
import { parseBpmFromString } from "@/lib/tempoUtils";
import { detectSliceMarkers, selectTopSlices, type SliceMarker, type SliceDetectionMode } from "@/lib/sliceDetection";
import { ExportOverwriteDialog } from "@/components/ExportOverwriteDialog";
import {
  ExportOptionsDialog,
  DEFAULT_OPTIONS as DEFAULT_EXPORT_OPTIONS,
  type ExportMarkerOptions,
} from "@/components/ExportOptionsDialog";
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
  /** When set, sync playhead with multi-sample stack playback for this sample */
  multiSampleId?: string | null;
  /** Called when a file is saved (export or record) so the file pane can refresh */
  onFileSaved?: (paneType: "source" | "dest") => void;
}

export const AudioPreview = ({
  filePath,
  fileName,
  onClose,
  paneType = "source",
  isEmptyState = false,
  multiSampleId = null,
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

  const [envelopeEnabled, setEnvelopeEnabled] = useState(false);
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");
  const [isRecording, setIsRecording] = useState(false);
  const [isRecordPaused, setIsRecordPaused] = useState(false);
  const [isRecordArmed, setIsRecordArmed] = useState(false);
  const [recordArmedMode, setRecordArmedMode] = useState<"replace" | "overdub">("replace");
  const recordArmedModeRef = useRef<"replace" | "overdub">("replace");
  const recordingModeRef = useRef<"replace" | "overdub">("replace");
  const recordStartTimeRef = useRef<number>(0);
  const [exportOverwriteOpen, setExportOverwriteOpen] = useState(false);
  const exportOverwriteResolverRef = useRef<((choice: "abort" | "overwrite" | "saveAs") => void) | null>(null);
  const [exportSaveAsOpen, setExportSaveAsOpen] = useState(false);
  const [exportSaveAsFilename, setExportSaveAsFilename] = useState("");
  const [exportSaveAsDirHandle, setExportSaveAsDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const exportSaveAsResolverRef = useRef<((result: { dirHandle: FileSystemDirectoryHandle; filename: string } | null) => void) | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportOptionsOpen, setExportOptionsOpen] = useState(false);
  const [exportMarkerOptions, setExportMarkerOptions] = useState<ExportMarkerOptions>(() => ({
    ...DEFAULT_EXPORT_OPTIONS,
  }));

  const setEdits = useSampleEditsStore((s) => s.setEdits);
  const getEdits = useSampleEditsStore((s) => s.getEdits);
  const playerIsPlaying = usePlayerStore((s) => s.isPlaying);
  const requestRestartWithNewLoop = usePlayerStore((s) => s.requestRestartWithNewLoop);
  const playerMode = usePlayerStore((s) => s.mode);
  const singleFile = usePlayerStore((s) => s.singleFile);
  const [wavesurferPlaying, setWavesurferPlaying] = useState(false);
  const wavesurferPlayingRef = useRef(false);
  wavesurferPlayingRef.current = wavesurferPlaying;
  const isPlaying = playerIsPlaying || wavesurferPlaying;
  const playerCurrentTime = usePlayerStore((s) => s.currentTime);
  const playSingle = usePlayerStore((s) => s.playSingle);
  const playMulti = usePlayerStore((s) => s.playMulti);
  const stopPlayer = usePlayerStore((s) => s.stop);
  const requestSwitchAtNextBar = usePlayerStore((s) => s.requestSwitchAtNextBar);
  const setActiveSample = usePlayerStore((s) => s.setActiveSample);
  const stack = useMultiSampleStore((s) => s.stack);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [zoom, setZoom] = useState(50);
  const zoomRef = useRef(50);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [normalize, setNormalize] = useState(false);
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [waveformHeight, setWaveformHeight] = useState(200);
  const [debouncedWaveformHeight, setDebouncedWaveformHeight] = useState(200);
  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedWaveformHeight(waveformHeight), 150);
    return () => clearTimeout(t);
  }, [waveformHeight]);

  const playingSamplePosition = useMultiSampleStore((s) => s.playingSamplePosition);

  // Sync playhead from unified player: multi mode uses playingSamplePosition, single uses playerCurrentTime
  useEffect(() => {
    const ws = wavesurferRef.current;
    if (!ws || !duration) return;
    let t: number;
    if (playerMode === "multi" && multiSampleId && playingSamplePosition?.sampleId === multiSampleId) {
      t = playingSamplePosition.currentTime;
    } else if (playerMode === "single" && isPlaying) {
      t = playerCurrentTime;
    } else return;
    const safeTime = Math.min(t, duration * 0.9999);
    ws.seekTo(safeTime / duration);
    setCurrentTime(safeTime);
  }, [playerMode, multiSampleId, playingSamplePosition, isPlaying, playerCurrentTime, duration]);

  const heightDragStartRef = useRef<{ y: number; h: number } | null>(null);
  const playStartTimeRef = useRef<number>(0);
  const playSliceEndRef = useRef<number | null>(null);
  const playSliceStartRef = useRef<number | null>(null);
  const onFileSavedRef = useRef(onFileSaved);
  onFileSavedRef.current = onFileSaved;
  const [exportFilenameOpen, setExportFilenameOpen] = useState(false);
  const [exportFilename, setExportFilename] = useState("");
  const exportFilenameResolverRef = useRef<((name: string | null) => void) | null>(null);
  const lastRecordedBlobRef = useRef<Blob | null>(null);

  const [slicingOpen, setSlicingOpen] = useState(false);
  const [addMarkerMode, setAddMarkerMode] = useState(false);
  const [sliceMarkers, setSliceMarkers] = useState<SliceMarker[]>([]);
  const [numSlices, setNumSlices] = useState(8);
  const [sliceDetectionMode, setSliceDetectionMode] = useState<SliceDetectionMode>("transient");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const numSlicesDragRef = useRef<{ startY: number; startX: number; startValue: number } | null>(null);
  const addSliceAtTimeRef = useRef<(t: number) => void>(() => {});
  const addMarkerModeRef = useRef(false);
  const sliceMarkersRef = useRef<SliceMarker[]>([]);

  const [sliceConfidenceOverrides, setSliceConfidenceOverrides] = useState<Map<string, number>>(
    () => new Map<string, number>(),
  );
  const [slicePositionOverrides, setSlicePositionOverrides] = useState<Map<string, number>>(
    () => new Map<string, number>(),
  );
  const [userAddedSlices, setUserAddedSlices] = useState<SliceMarker[]>([]);
  const [hoveredSliceKey, setHoveredSliceKey] = useState<string | null>(null);
  const [timeDisplayMode, setTimeDisplayMode] = useState<"clock" | "bars">("clock");
  const [tempoBpm, setTempoBpm] = useState(120);
  const [tempoEditingValue, setTempoEditingValue] = useState<string | null>(null);
  const [timeSignature, setTimeSignature] = useState("4/4");
  const [loopStart, setLoopStart] = useState(0);
  const [loopEnd, setLoopEnd] = useState(0);
  const [playStart, setPlayStart] = useState(0);
  const [loopEnabled, setLoopEnabled] = useState(true);
  const loopEnabledRef = useRef(true);
  const [rootKey, setRootKey] = useState("");
  const [tuningCents, setTuningCents] = useState(0);
  const loopPartDragRef = useRef<{ startY: number; startX: number; startValue: number } | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const [audioFileInfo, setAudioFileInfo] = useState<AudioFileInfo | null>(null);
  const [sampleRate, setSampleRate] = useState(44100);
  const devMode = useAppOptionsStore((s) => s.devMode);

  useEffect(() => {
    loopEnabledRef.current = loopEnabled;
  }, [loopEnabled]);

  // When playback stops, seek waveform to play start (handles space bar stop from anywhere)
  const prevIsPlayingRef = useRef(isPlaying);
  useEffect(() => {
    const wasPlaying = prevIsPlayingRef.current;
    prevIsPlayingRef.current = isPlaying;
    if (wasPlaying && !isPlaying && wavesurferRef.current && duration > 0) {
      const clampedPlayStart = Math.max(loopStart, Math.min(loopEnd || duration, playStart));
      wavesurferRef.current.seekTo(clampedPlayStart / duration);
      setCurrentTime(clampedPlayStart);
    }
  }, [isPlaying, duration, loopStart, loopEnd, playStart]);

  const parsedTimeSignature = useMemo(() => {
    const m = timeSignature.trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (!m) return { beatsPerBar: 4, beatUnit: 4 };
    const beatsPerBar = Math.max(1, Number.parseInt(m[1], 10) || 4);
    const beatUnit = Math.max(1, Number.parseInt(m[2], 10) || 4);
    return { beatsPerBar, beatUnit };
  }, [timeSignature]);

  const secondsPerBeat = useMemo(() => {
    const beatUnitFactor = 4 / parsedTimeSignature.beatUnit;
    return (60 / Math.max(1, tempoBpm)) * beatUnitFactor;
  }, [parsedTimeSignature.beatUnit, tempoBpm]);

  const secondsPerBar = useMemo(
    () => secondsPerBeat * parsedTimeSignature.beatsPerBar,
    [secondsPerBeat, parsedTimeSignature.beatsPerBar],
  );

  const snapToSixteenth = useCallback(
    (seconds: number) => {
      if (secondsPerBeat <= 0) return seconds;
      const sixteenth = secondsPerBeat / 4;
      return Math.round(seconds / sixteenth) * sixteenth;
    },
    [secondsPerBeat],
  );

  const clampToDuration = useCallback(
    (seconds: number) => Math.max(0, Math.min(duration, seconds)),
    [duration],
  );

  const formatTime = useCallback((seconds: number): string => {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const formatBarsBeats = useCallback(
    (seconds: number): string => {
      if (!Number.isFinite(seconds) || seconds < 0 || secondsPerBeat <= 0) return "1.1.00";
      const totalBeats = seconds / secondsPerBeat;
      const barsZero = Math.floor(totalBeats / parsedTimeSignature.beatsPerBar);
      const beatInBar = Math.floor(totalBeats % parsedTimeSignature.beatsPerBar);
      const sixteenth = Math.floor(((totalBeats - Math.floor(totalBeats)) * 4) % 4);
      return `${barsZero + 1}.${beatInBar + 1}.${String(Math.max(0, sixteenth)).padStart(2, "0")}`;
    },
    [parsedTimeSignature.beatsPerBar, secondsPerBeat],
  );

  const sliceKey = (t: number) => t.toFixed(4);

  const combinedSliceMarkers = useMemo(() => {
    const overridden = sliceMarkers.map((m) => {
      const key = sliceKey(m.time);
      const conf = sliceConfidenceOverrides.get(key);
      return { ...m, confidence: conf !== undefined ? conf : m.confidence };
    });
    return [...overridden, ...userAddedSlices];
  }, [sliceMarkers, sliceConfidenceOverrides, userAddedSlices]);

  const displayedSlices = useMemo(() => {
    const selected = selectTopSlices(combinedSliceMarkers, numSlices);
    return selected.map((m) => {
      const key = sliceKey(m.time);
      const pos = slicePositionOverrides.get(key);
      const displayTime = pos !== undefined ? pos : m.time;
      const isUserAdded = userAddedSlices.some((u) => Math.abs(u.time - m.time) < 0.001);
      return { ...m, time: displayTime, originalTime: m.time, isUserAdded };
    });
  }, [combinedSliceMarkers, numSlices, slicePositionOverrides, userAddedSlices]);

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
    isOverlayDrag: boolean;
    hasMoved: boolean;
    shouldSeekOnMouseUp: boolean;
    debugMoveSamples: number;
    debugScrollSamples: number;
  } | null>(null);

  // Handle mouse down on minimap: click=seek, drag=zoom (vertical) + scroll (horizontal)
  // Dragging the visible area overlay scrolls only (navigate) when overlay is narrower than minimap.
  const handleMinimapMouseDown = useCallback(
    (e: MouseEvent) => {
      if (!wavesurferRef.current || !minimapContainerRef.current || isLoading) return;
      const minimapRect = minimapContainerRef.current.getBoundingClientRect();
      const overlayEl = minimapContainerRef.current.querySelector('[part="minimap-overlay"]') as HTMLElement | null;
      const overlayRect = overlayEl?.getBoundingClientRect();
      const isWithinOverlay =
        !!overlayRect &&
        e.clientX >= overlayRect.left &&
        e.clientX <= overlayRect.right &&
        e.clientY >= overlayRect.top &&
        e.clientY <= overlayRect.bottom;
      // If overlay takes a large share of the minimap, treat drag as background drag
      // so users can still access vertical zoom-out without pixel-hunting outside the overlay.
      const overlayCoverage = overlayRect && minimapRect.width > 0 ? overlayRect.width / minimapRect.width : 0;
      const overlayFillsMinimap = overlayCoverage >= 0.5;
      const isOverlay = isWithinOverlay && !overlayFillsMinimap;

      const currentDuration = wavesurferRef.current.getDuration();
      if (!currentDuration) return;

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
        startZoom: zoomRef.current,
        startScroll,
        isMinimapDrag: true,
        isOverlayDrag: !!isOverlay,
        hasMoved: false,
        shouldSeekOnMouseUp: !isOverlay,
        debugMoveSamples: 0,
        debugScrollSamples: 0,
      };
      e.preventDefault();
    },
    [isLoading],
  );

  // Handle mouse down on waveform (for click-to-seek; zoom only via minimap)
  const handleWaveformMouseDown = (e: React.MouseEvent) => {
    if (!wavesurferRef.current || isLoading) return;
    const minimapRect = minimapContainerRef.current?.getBoundingClientRect();
    const isInsideMinimap =
      !!minimapRect &&
      e.clientX >= minimapRect.left &&
      e.clientX <= minimapRect.right &&
      e.clientY >= minimapRect.top &&
      e.clientY <= minimapRect.bottom;
    if (isInsideMinimap) {
      return;
    }
    dragStateRef.current = {
      isDragging: false,
      startY: e.clientY,
      startX: e.clientX,
      startZoom: zoom,
      startScroll: 0,
      isMinimapDrag: false,
      isOverlayDrag: false,
      hasMoved: false,
      shouldSeekOnMouseUp: false,
      debugMoveSamples: 0,
      debugScrollSamples: 0,
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

        const result = await fileSystemService.getAudioFileBlob(filePath!, paneType!);

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

  const sliceDetectionRunForRef = useRef<string | null>(null);
  const prevFilePathForLoopRef = useRef<string | null>(null);

  // On load: parse embedded metadata (tempo/timesig/slices/start-end).
  // Uses fileSystemService to avoid wrong buffer when audioUrl is stale during sample switch.
  useEffect(() => {
    if (isEmptyState || !filePath || !paneType) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await fileSystemService.getAudioFileBlob(filePath, paneType);
        if (!result.success || !result.data || cancelled) return;
        const res = await fetch(result.data);
        const arrayBuffer = await res.arrayBuffer();
        if (cancelled) return;
        const parsed = parseWavMetadata(arrayBuffer);
        if (parsed) {
          setSampleRate(parsed.sampleRate);
          if (parsed.tempo != null && Number.isFinite(parsed.tempo)) setTempoBpm(parsed.tempo);
          else {
            const bpmResult = parseBpmFromString(fileName ?? "");
            if (bpmResult?.bpm) setTempoBpm(bpmResult.bpm);
            else {
              const mainTempo = useMultiSampleStore.getState().globalTempoBpm;
              if (Number.isFinite(mainTempo) && mainTempo > 0) setTempoBpm(mainTempo);
            }
          }
          if (parsed.timeSignature) setTimeSignature(parsed.timeSignature);
          if (parsed.rootKey != null && Number.isFinite(parsed.rootKey)) setRootKey(String(parsed.rootKey));
          if (parsed.tuningCents != null && Number.isFinite(parsed.tuningCents)) setTuningCents(parsed.tuningCents);

          const metadataStart = parsed.sampleStartFrame != null ? parsed.sampleStartFrame / parsed.sampleRate : 0;
          const durationFromFile = parsed.totalFrames / parsed.sampleRate;
          const metadataEnd =
            parsed.sampleEndFrame != null
              ? parsed.sampleEndFrame / parsed.sampleRate
              : Math.max(metadataStart, duration || durationFromFile);
          const edits = getEdits(filePath);
          const dur = duration || metadataEnd;
          prevFilePathForLoopRef.current = filePath;
          setLoopStart(edits?.loopStart ?? Math.max(0, metadataStart));
          setLoopEnd(edits?.loopEnd ?? Math.max(metadataStart + 0.001, metadataEnd));
          setPlayStart(edits?.playStart ?? Math.max(0, metadataStart));
          setLoopEnabled(edits?.loopEnabled ?? true);

          if (parsed.sliceFrames.length > 0) {
            const markers: SliceMarker[] = parsed.sliceFrames.map((frame) => ({
              time: frame / parsed.sampleRate,
              confidence: 1,
            }));
            setSliceMarkers(markers);
            setNumSlices(markers.length);
            setSlicingOpen(true);
            setExportMarkerOptions((prev) => ({ ...prev, sliceFiles: true }));
            sliceDetectionRunForRef.current = filePath;
          }
        } else {
          setSampleRate(0);
        }
      } catch {
        // Ignore parse errors; user can open Slicing for detection
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [duration, fileName, filePath, paneType, isEmptyState, getEdits]);

  // Persist loop settings to sample-edits-store when they change (after file has loaded)
  useEffect(() => {
    if (!filePath || isEmptyState || duration <= 0) return;
    // Skip persist when loop values are from a different file (filePath changed but metadata not yet loaded)
    if (filePath !== prevFilePathForLoopRef.current) return;
    const existing = getEdits(filePath) ?? {};
    const prevLoopStart = existing.loopStart;
    const prevLoopEnd = existing.loopEnd;
    // Only restart when loop params actually changed from a previously persisted state (avoid restart on initial load)
    const loopParamsChanged =
      prevLoopStart != null &&
      prevLoopEnd != null &&
      (prevLoopStart !== loopStart || prevLoopEnd !== loopEnd);
    setEdits(filePath, {
      ...existing,
      loopStart,
      loopEnd,
      playStart,
      loopEnabled,
    });
    // Ableton-style: when loop length changes while playing, restart with synced playhead
    if (loopParamsChanged && loopEnabled && playerIsPlaying) {
      const isThisFilePlaying =
        (playerMode === "single" && singleFile?.path === filePath) ||
        (playerMode === "multi" && stack.some((s) => s.path === filePath));
      if (isThisFilePlaying) {
        requestRestartWithNewLoop({ path: filePath, newLoopStart: loopStart, newLoopEnd: loopEnd });
      }
    }
  }, [filePath, isEmptyState, duration, loopStart, loopEnd, playStart, loopEnabled, setEdits, getEdits, playerIsPlaying, playerMode, singleFile, stack, requestRestartWithNewLoop]);

  // When opened from multi-sample, sync tempo with the sample's BPM so loop length in bars matches
  const slots = useMultiSampleStore((s) => s.slots);
  const globalTempoBpm = useMultiSampleStore((s) => s.globalTempoBpm);
  useEffect(() => {
    if (!multiSampleId || isEmptyState) return;
    const sample = slots.find((s): s is NonNullable<typeof s> => s != null && s.id === multiSampleId);
    const bpm = sample?.bpm ?? globalTempoBpm;
    if (Number.isFinite(bpm) && bpm > 0) setTempoBpm(bpm);
  }, [multiSampleId, isEmptyState, slots, globalTempoBpm]);

  // Slice detection: run only when user opens Slicing panel (lazy). Parse embedded cues first (fast), else run transient/pitch detection.
  // Uses fileSystemService directly to avoid wrong-buffer when audioUrl is stale during sample switch.
  const runSliceDetection = useCallback(async () => {
    if (isEmptyState || !filePath || !paneType) return;
    const key = `${filePath}`;
    if (sliceDetectionRunForRef.current === key) return;
    sliceDetectionRunForRef.current = key;

    setIsAnalyzing(true);
    try {
      const result = await fileSystemService.getAudioFileBlob(filePath, paneType);
      if (!result.success || !result.data) {
        setSliceMarkers([]);
        setIsAnalyzing(false);
        return;
      }
      const res = await fetch(result.data);
      const arrayBuffer = await res.arrayBuffer();

      const parsed = parseWavCueMarkers(arrayBuffer);
      if (parsed && parsed.sampleFrames.length > 0) {
        const markers: SliceMarker[] = parsed.sampleFrames.map((frame) => ({
          time: frame / parsed.sampleRate,
          confidence: 1,
        }));
        setSliceMarkers(markers);
        setNumSlices(markers.length);
        setExportMarkerOptions((prev) => ({ ...prev, sliceFiles: true }));
        setIsAnalyzing(false);
        return;
      }

      const ctx = new AudioContext();
      const buffer = await ctx.decodeAudioData(arrayBuffer);
      await ctx.close();

      const bpmResult = parseBpmFromString(fileName ?? "");
      const bpm = bpmResult?.bpm ?? 120;
      const markers = detectSliceMarkers(buffer, buffer.duration, bpm, sliceDetectionMode);
      setSliceMarkers(markers);
      const bars = (buffer.duration * bpm) / 240;
      setNumSlices(Math.max(1, Math.floor(8 * bars)));
    } catch (err) {
      console.warn("Slice detection failed:", err);
      setSliceMarkers([]);
    } finally {
      setIsAnalyzing(false);
    }
  }, [fileName, isEmptyState, filePath, paneType, sliceDetectionMode]);

  useEffect(() => {
    if (isEmptyState || !filePath) {
      sliceDetectionRunForRef.current = null;
    }
  }, [isEmptyState, filePath]);

  useEffect(() => {
    if (slicingOpen && !isEmptyState && filePath && paneType && sliceMarkers.length === 0) {
      runSliceDetection();
    }
  }, [slicingOpen, isEmptyState, filePath, paneType, sliceMarkers.length, runSliceDetection]);

  // Clear slice markers and overrides when file changes or empty state
  const prevFilePathRef = useRef<string | null>(null);
  useEffect(() => {
    if (isEmptyState || !filePath) {
      prevFilePathForLoopRef.current = null;
      setSliceMarkers([]);
      setSliceConfidenceOverrides(new Map<string, number>());
      setSlicePositionOverrides(new Map<string, number>());
      setUserAddedSlices([]);
      sliceDetectionRunForRef.current = null;
      prevFilePathRef.current = filePath;
      return;
    }
    // When switching samples in multi, reset slice state so it reflects the new sample
    if (prevFilePathRef.current !== filePath) {
      setSliceMarkers([]);
      setSliceConfidenceOverrides(new Map<string, number>());
      setSlicePositionOverrides(new Map<string, number>());
      setUserAddedSlices([]);
      sliceDetectionRunForRef.current = null;
      prevFilePathRef.current = filePath;
    }
  }, [isEmptyState, filePath]);

  useEffect(() => {
    if (duration <= 0) return;
    setLoopEnd((prev) => (prev > 0 ? Math.min(duration, prev) : duration));
    setLoopStart((prev) => Math.max(0, Math.min(duration, prev)));
    setPlayStart((prev) => Math.max(0, Math.min(duration, prev)));
  }, [duration]);

  useEffect(() => {
    setPlayStart((prev) => Math.max(loopStart, Math.min(loopEnd || duration, prev)));
  }, [duration, loopEnd, loopStart]);

  useEffect(() => {
    if (!filePath) {
      setTimeDisplayMode("clock");
      setTimeSignature("4/4");
      setTempoBpm(120);
      setLoopStart(0);
      setLoopEnd(0);
      setPlayStart(0);
      setRootKey("");
      setTuningCents(0);
      return;
    }
    const bpmResult = parseBpmFromString(fileName ?? "");
    if (bpmResult?.bpm) setTempoBpm(bpmResult.bpm);
  }, [fileName, filePath]);

  // Stop playback when file changes (single mode only; multi mode keeps playing when switching samples)
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
      // In multi mode, don't stop when switching samples or closing (e.g. tapping empty block)
      // In single mode, don't stop when switching to a new file (switch-at-next-bar handles it)
      const playerState = usePlayerStore.getState();
      const isMultiMode = playerState.mode === "multi";
      const storeFilePath = useWaveformEditorStore.getState().filePath;
      const isSwitchingToNewFile =
        !isMultiMode && storeFilePath && storeFilePath !== filePath && playerState.isPlaying;
      if (!multiSampleId && !isMultiMode && !isSwitchingToNewFile) {
        stopPlayer();
      }
      setWavesurferPlaying(false);
      setCurrentTime(0);
      setDuration(0);
    };
  }, [filePath, stopPlayer, multiSampleId]);

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
      const playerState = usePlayerStore.getState();
      if (
        playerState.isPlaying &&
        playerState.mode === "single" &&
        filePath &&
        paneType
      ) {
        requestSwitchAtNextBar(filePath, paneType);
      } else if (playerState.mode !== "multi") {
        stopPlayer();
      }
      // In multi mode, never stop here - keep playback running when switching samples
      setWavesurferPlaying(false);
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
        interact: false, // We handle click-to-seek ourselves; prevents seek when adding markers or envelope points
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
        setIsRecordArmed(false);
        lastRecordedBlobRef.current = blob;
        const mode = recordingModeRef.current;
        if (filePath && paneType && mode === "overdub") {
          try {
            const existingResult = await fileSystemService.getAudioFileBlob(filePath, paneType);
            if (!existingResult.success || !existingResult.data) {
              toast.error("Could not load existing audio for overdub");
              return;
            }
            const existingBlob = await fetch(existingResult.data).then((r) => r.blob());
            const mixed = await mixOverdub(existingBlob, blob, recordStartTimeRef.current);
            if (mixed) {
              const result = await fileSystemService.writeBlobToPath(filePath, mixed, paneType);
              if (result.success) {
                toast.success("Overdub saved");
                onFileSavedRef.current?.(paneType);
                if (wavesurferRef.current && !cancelled) {
                  const url = URL.createObjectURL(mixed);
                  wavesurferRef.current.load(url);
                }
              } else {
                toast.error(result.error || "Overdub save failed");
              }
            }
          } catch (err) {
            toast.error(String(err));
          }
        } else if (filePath && paneType && mode === "replace") {
          try {
            const existingResult = await fileSystemService.getAudioFileBlob(filePath, paneType);
            if (existingResult.success && existingResult.data) {
              const existingBlob = await fetch(existingResult.data).then((r) => r.blob());
              const replaced = await replaceSegment(existingBlob, blob, recordStartTimeRef.current);
              const result = await fileSystemService.writeBlobToPath(filePath, replaced, paneType);
              if (result.success) {
                toast.success("Recording saved");
                onFileSavedRef.current?.(paneType);
                if (wavesurferRef.current && !cancelled) {
                  const url = URL.createObjectURL(replaced);
                  wavesurferRef.current.load(url);
                }
              } else {
                toast.error(result.error || "Failed to save recording");
              }
            } else {
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
            }
          } catch (err) {
            toast.error(String(err));
          }
        } else if (filePath && paneType) {
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
      const timelineTimeInterval =
        timeDisplayMode === "bars" && secondsPerBeat > 0 ? secondsPerBeat / 4 : 0.2;
      const timelinePrimaryInterval =
        timeDisplayMode === "bars" && secondsPerBar > 0 ? secondsPerBar : 5;
      const timelineSecondaryInterval =
        timeDisplayMode === "bars" && secondsPerBeat > 0 ? secondsPerBeat : 1;
      const timeline = TimelinePlugin.create({
        height: 20,
        insertPosition: "beforebegin",
        timeInterval: timelineTimeInterval,
        primaryLabelInterval: timelinePrimaryInterval,
        secondaryLabelInterval: timelineSecondaryInterval,
        formatTimeCallback: (sec: number) => (timeDisplayMode === "bars" ? formatBarsBeats(sec) : formatTime(sec)),
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
        interact: false,
        dragToSeek: false,
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
        if (!cancelled) setWavesurferPlaying(true);
      });

      wavesurfer.on("pause", () => {
        if (!cancelled) setWavesurferPlaying(false);
      });

      wavesurfer.on("finish", () => {
        if (!cancelled) setWavesurferPlaying(false);
      });

      wavesurfer.on("timeupdate", (time) => {
        if (!cancelled && wavesurferPlayingRef.current) {
          setCurrentTime(time);
          const end = playSliceEndRef.current;
          if (end != null && time >= end - 0.01) {
            playSliceEndRef.current = null;
            playSliceStartRef.current = null;
            wavesurfer.pause();
          }
        }
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
      // In multi mode, don't stop when closing (e.g. tapping empty block)
      // In single mode, don't stop when switching to new file (switch-at-next-bar handles it)
      const playerState = usePlayerStore.getState();
      const isMultiMode = playerState.mode === "multi";
      const storeFilePath = useWaveformEditorStore.getState().filePath;
      const isSwitchingToNewFile =
        !isMultiMode && storeFilePath && storeFilePath !== filePath && playerState.isPlaying;
      if (!isMultiMode && !isSwitchingToNewFile) {
        stopPlayer();
      }
      setWavesurferPlaying(false);
    };
  }, [
    audioUrl,
    normalize,
    fileName,
    filePath,
    setEdits,
    debouncedWaveformHeight,
    timeDisplayMode,
    secondsPerBar,
    secondsPerBeat,
    formatBarsBeats,
    formatTime,
    stopPlayer,
    requestSwitchAtNextBar,
  ]);

  // Effect to find and attach handler to minimap element after it's created
  useEffect(() => {
    if (isLoading || !duration) return;

    // Find the minimap element (inserted by WaveSurfer with part="minimap")
    const findMinimap = () => {
      if (waveformRef.current) {
        const wrapper = wavesurferRef.current?.getWrapper?.() as HTMLElement | undefined;
        const wrapperRoot = wrapper?.getRootNode?.() as ShadowRoot | Document | undefined;
        const minimapInParent = waveformRef.current.parentElement?.querySelector(
          '[part="minimap"]',
        ) as HTMLDivElement | null;
        const minimapInWrapperRoot = (wrapperRoot as ParentNode | undefined)?.querySelector?.(
          '[part="minimap"]',
        ) as HTMLDivElement | null;
        const minimapElement = minimapInParent || minimapInWrapperRoot;
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

  useEffect(() => {
    const handlePointerDownCapture = (e: PointerEvent) => {
      if (!minimapContainerRef.current) return;
      const rect = minimapContainerRef.current.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) return;
    };
    window.addEventListener("pointerdown", handlePointerDownCapture, true);
    return () => window.removeEventListener("pointerdown", handlePointerDownCapture, true);
  }, []);

  // Update zoom
  useEffect(() => {
    if (wavesurferRef.current) {
      wavesurferRef.current.zoom(zoom);
    }
  }, [zoom]);

  // Update playback rate (wavesurfer for slice playback; player store for unified playback)
  useEffect(() => {
    usePlayerStore.getState().setPlaybackRate(playbackRate);
    if (wavesurferRef.current) {
      wavesurferRef.current.setPlaybackRate(playbackRate);
    }
  }, [playbackRate]);

  // Update volume (wavesurfer for slice playback; player store for unified playback)
  useEffect(() => {
    usePlayerStore.getState().setVolume(volume);
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

  // Hide envelope when slicing is open so the first slice marker is visible (avoids overlap with first envelope point)
  useEffect(() => {
    if (!waveformRef.current || isLoading || !duration) return;
    const findAndUpdateEnvelope = () => {
      const wrapper = wavesurferRef.current?.getWrapper?.() as HTMLElement | undefined;
      const envelopeEl =
        waveformRef.current?.parentElement?.querySelector('[part="envelope"]') ??
        wrapper?.querySelector('[part="envelope"]');
      const el = envelopeEl as HTMLElement | null;
      if (!el) return false;
      const showEnvelope = envelopeEnabled && !slicingOpen;
      el.style.visibility = showEnvelope ? "" : "hidden";
      el.style.pointerEvents = showEnvelope ? "" : "none";
      return true;
    };
    if (!findAndUpdateEnvelope()) {
      const t = setTimeout(findAndUpdateEnvelope, 100);
      const t2 = setTimeout(findAndUpdateEnvelope, 500);
      return () => {
        clearTimeout(t);
        clearTimeout(t2);
      };
    }
  }, [envelopeEnabled, slicingOpen, isLoading, duration]);

  const startRecordingFromHere = useCallback(
    async (mode: "replace" | "overdub") => {
      const plugin = recordPluginRef.current;
      if (!plugin || !wavesurferRef.current || isLoading) return;
      if (isPlaying) {
        wavesurferRef.current.pause();
      }
      recordingModeRef.current = mode;
      recordStartTimeRef.current = wavesurferRef.current.getCurrentTime();
      try {
        const opts = selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : undefined;
        await plugin.startRecording(opts);
        setIsRecording(true);
        setIsRecordPaused(false);
        setIsRecordArmed(false);
      } catch (err) {
        toast.error(String(err));
      }
    },
    [isLoading, selectedDeviceId],
  );

  const handleStopOrPlay = useCallback(() => {
    if (isLoading) return;
    if (isRecording) {
      recordPluginRef.current?.stopRecording();
      return;
    }
    const clampedPlayStart = Math.max(loopStart, Math.min(loopEnd || duration, playStart));
    if (isRecordArmed) {
      startRecordingFromHere(recordArmedModeRef.current);
      return;
    }
    if (isPlaying) {
      stopPlayer();
      if (wavesurferRef.current && duration > 0) {
        wavesurferRef.current.seekTo(clampedPlayStart / duration);
      }
      return;
    }
    // Wave editor: play the sample being edited (unified playback loads file independently)
    if (filePath && paneType && !isEmptyState) {
      playSingle(filePath, paneType);
    }
  }, [
    isPlaying,
    isRecording,
    isRecordArmed,
    isLoading,
    duration,
    loopEnd,
    loopStart,
    playStart,
    startRecordingFromHere,
    filePath,
    paneType,
    isEmptyState,
    stopPlayer,
    playSingle,
  ]);

  const handleRecordClick = useCallback(() => {
    if (isRecording) {
      recordPluginRef.current?.stopRecording();
      setIsRecordArmed(false);
      return;
    }
    if (isPlaying) {
      startRecordingFromHere("replace");
      return;
    }
    if (isRecordArmed && recordArmedModeRef.current === "replace") {
      setIsRecordArmed(false);
      return;
    }
    recordArmedModeRef.current = "replace";
    setRecordArmedMode("replace");
    setIsRecordArmed(true);
  }, [isRecording, isPlaying, isRecordArmed, startRecordingFromHere]);

  const handleOverdubClick = useCallback(() => {
    if (isRecording) {
      recordPluginRef.current?.stopRecording();
      setIsRecordArmed(false);
      return;
    }
    if (isPlaying) {
      startRecordingFromHere("overdub");
      return;
    }
    if (isRecordArmed && recordArmedModeRef.current === "overdub") {
      setIsRecordArmed(false);
      return;
    }
    recordArmedModeRef.current = "overdub";
    setRecordArmedMode("overdub");
    setIsRecordArmed(true);
  }, [isRecording, isPlaying, isRecordArmed, startRecordingFromHere]);

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

  const handleNumSlicesDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (isLoading || isAnalyzing) return;
      e.preventDefault();
      const max = Math.max(1, sliceMarkers.length);
      numSlicesDragRef.current = { startY: e.clientY, startX: e.clientX, startValue: numSlices };
      const onMove = (moveE: MouseEvent) => {
        if (!numSlicesDragRef.current) return;
        const dy = numSlicesDragRef.current.startY - moveE.clientY;
        const dx = moveE.clientX - numSlicesDragRef.current.startX;
        const steps = Math.round((dy + dx) / 8);
        const next = Math.max(1, Math.min(max, numSlicesDragRef.current.startValue + steps));
        setNumSlices(next);
      };
      const onUp = () => {
        numSlicesDragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [isLoading, isAnalyzing, numSlices, sliceMarkers.length],
  );

  const removeSlice = useCallback((originalTime: number, isUserAdded: boolean) => {
    const key = sliceKey(originalTime);
    if (isUserAdded) {
      setUserAddedSlices((prev) => prev.filter((s) => Math.abs(s.time - originalTime) > 0.001));
    } else {
      setSliceConfidenceOverrides((prev) => new Map(prev).set(key, 0));
    }
    setNumSlices((prev) => Math.max(1, prev - 1));
  }, []);

  const addSliceAtTime = useCallback(
    (clickTime: number) => {
      const selected = selectTopSlices(combinedSliceMarkers, numSlices);
      const minConfidence = selected.length > 0 ? Math.min(...selected.map((s) => s.confidence)) : 0.5;
      const threshold = minConfidence + 0.01;
      const minSpacingSec = 20 / 1000;
      const excluded = new Set(selected.map((s) => sliceKey(s.time)));
      const allMarked = [...selected, ...userAddedSlices];
      let best: SliceMarker | null = null;
      let bestDist = Infinity;
      // Prefer a detected transient near the click that isn't already marked
      for (const m of sliceMarkers) {
        const key = sliceKey(m.time);
        if (excluded.has(key)) continue;
        const tooClose = allMarked.some((s) => Math.abs(s.time - m.time) < minSpacingSec);
        if (tooClose) continue;
        const dist = Math.abs(m.time - clickTime);
        if (dist < bestDist) {
          bestDist = dist;
          best = m;
        }
      }
      const timeToAdd = best ? best.time : clickTime;
      setUserAddedSlices((prev) => [...prev, { time: timeToAdd, confidence: Math.min(1, threshold) }]);
      setNumSlices((prev) => prev + 1);
    },
    [combinedSliceMarkers, numSlices, sliceMarkers, userAddedSlices],
  );

  const updateSlicePosition = useCallback((originalTime: number, newTime: number) => {
    const key = sliceKey(originalTime);
    setSlicePositionOverrides((prev) => new Map(prev).set(key, newTime));
  }, []);

  const playSlice = useCallback(
    (sliceIndex: number) => {
      if (!wavesurferRef.current || duration <= 0) return;
      const start = displayedSlices[sliceIndex]?.time ?? 0;
      const end = displayedSlices[sliceIndex + 1]?.time ?? duration;
      if (start >= end) return;
      playSliceEndRef.current = end;
      wavesurferRef.current.seekTo(start / duration);
      wavesurferRef.current.play();
    },
    [duration, displayedSlices],
  );

  addSliceAtTimeRef.current = addSliceAtTime;
  addMarkerModeRef.current = addMarkerMode;
  sliceMarkersRef.current = sliceMarkers;

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

  const getLoopLengthParts = useCallback(() => {
    const len = Math.max(0, loopEnd - loopStart);
    const totalBeats = secondsPerBeat > 0 ? len / secondsPerBeat : 0;
    let bars = Math.floor(totalBeats / parsedTimeSignature.beatsPerBar);
    let beats = Math.floor(totalBeats % parsedTimeSignature.beatsPerBar);
    let sixteenths = Math.round((totalBeats - Math.floor(totalBeats)) * 4);
    // Normalize: 4 sixteenths = 1 beat (fixes floating-point e.g. 3.999999 for 4.0)
    if (sixteenths >= 4) {
      sixteenths = 0;
      beats += 1;
      if (beats >= parsedTimeSignature.beatsPerBar) {
        beats = 0;
        bars += 1;
      }
    }
    return { bars, beats, sixteenths };
  }, [loopEnd, loopStart, parsedTimeSignature.beatsPerBar, secondsPerBeat]);

  const applyLoopLengthParts = useCallback(
    (parts: { bars: number; beats: number; sixteenths: number }) => {
      // Allow negative values for borrowing; compute total beats from raw parts
      const bars = Math.floor(parts.bars);
      const beats = Math.floor(parts.beats);
      const sixteenths = Math.floor(parts.sixteenths);
      let totalBeats = bars * parsedTimeSignature.beatsPerBar + beats + sixteenths / 4;
      totalBeats = Math.max(0.25, totalBeats); // min 1 sixteenth
      const nextEnd = clampToDuration(loopStart + totalBeats * secondsPerBeat);
      if (nextEnd <= loopStart) return;
      setLoopEnd(nextEnd);
    },
    [clampToDuration, loopStart, parsedTimeSignature.beatsPerBar, secondsPerBeat],
  );

  const handleLoopBoundaryDrag = useCallback(
    (which: "start" | "end", e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = waveformRef.current?.getBoundingClientRect();
      if (!rect || duration <= 0) return;
      const startX = e.clientX;
      const startLoopStart = loopStart;
      const startLoopEnd = loopEnd > 0 ? loopEnd : duration;
      const initialLen = Math.max(0.001, startLoopEnd - startLoopStart);
      const quantize = timeDisplayMode === "bars";
      const nudgeMode = e.shiftKey;

      const onMove = (moveE: MouseEvent) => {
        const dx = moveE.clientX - startX;
        const delta = (dx / rect.width) * duration;
        if (which === "start") {
          if (nudgeMode) {
            let nextStart = clampToDuration(startLoopStart + delta);
            let nextEnd = clampToDuration(nextStart + initialLen);
            if (nextEnd >= duration) {
              nextEnd = duration;
              nextStart = Math.max(0, nextEnd - initialLen);
            }
            if (quantize) {
              const qStart = clampToDuration(snapToSixteenth(nextStart));
              const qEnd = clampToDuration(snapToSixteenth(nextEnd));
              if (qEnd > qStart) {
                nextStart = qStart;
                nextEnd = qEnd;
              }
            }
            setLoopStart(nextStart);
            setLoopEnd(Math.max(nextStart + 0.001, nextEnd));
            return;
          }
          let nextStart = clampToDuration(startLoopStart + delta);
          if (quantize) nextStart = clampToDuration(snapToSixteenth(nextStart));
          nextStart = Math.min(nextStart, startLoopEnd - 0.001);
          setLoopStart(nextStart);
        } else {
          if (nudgeMode) {
            let nextEnd = clampToDuration(startLoopEnd + delta);
            let nextStart = clampToDuration(nextEnd - initialLen);
            if (nextStart <= 0) {
              nextStart = 0;
              nextEnd = Math.min(duration, initialLen);
            }
            if (quantize) {
              const qStart = clampToDuration(snapToSixteenth(nextStart));
              const qEnd = clampToDuration(snapToSixteenth(nextEnd));
              if (qEnd > qStart) {
                nextStart = qStart;
                nextEnd = qEnd;
              }
            }
            setLoopStart(nextStart);
            setLoopEnd(Math.max(nextStart + 0.001, nextEnd));
            return;
          }
          let nextEnd = clampToDuration(startLoopEnd + delta);
          if (quantize) nextEnd = clampToDuration(snapToSixteenth(nextEnd));
          nextEnd = Math.max(nextEnd, loopStart + 0.001);
          setLoopEnd(nextEnd);
        }
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [clampToDuration, duration, loopEnd, loopStart, snapToSixteenth, timeDisplayMode],
  );

  const handleSampleBoundaryDrag = useCallback(
    (which: "start" | "end" | "play", e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = waveformRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dragDuration = duration > 0 ? duration : 1;
      const startX = e.clientX;
      const startLoopStart = loopStart;
      const startLoopEnd = loopEnd > 0 ? loopEnd : dragDuration;
      const startPlayStart = playStart;
      const minLength = 0.001;

      const onMove = (moveE: MouseEvent) => {
        const dx = moveE.clientX - startX;
        const delta = (dx / rect.width) * dragDuration;
        if (which === "start") {
          const nextStart = Math.max(0, Math.min(startLoopEnd - minLength, startLoopStart + delta));
          setLoopStart(nextStart);
          setPlayStart((prev) => Math.max(nextStart, prev));
          return;
        }
        if (which === "end") {
          const nextEnd = Math.max(startLoopStart + minLength, Math.min(dragDuration, startLoopEnd + delta));
          setLoopEnd(nextEnd);
          setPlayStart((prev) => Math.min(nextEnd, prev));
          return;
        }
        const nextPlayStart = Math.max(startLoopStart, Math.min(startLoopEnd, startPlayStart + delta));
        setPlayStart(nextPlayStart);
      };

      const onUp = () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [duration, loopEnd, loopStart, playStart],
  );

  const handleLoopPartDragStart = useCallback(
    (part: "bars" | "beats" | "sixteenths", e: React.MouseEvent) => {
      e.preventDefault();
      const loopParts = getLoopLengthParts();
      const startValue = part === "bars" ? loopParts.bars : part === "beats" ? loopParts.beats : loopParts.sixteenths;
      loopPartDragRef.current = { startY: e.clientY, startX: e.clientX, startValue };

      const onMove = (moveE: MouseEvent) => {
        if (!loopPartDragRef.current) return;
        const dy = loopPartDragRef.current.startY - moveE.clientY;
        const dx = moveE.clientX - loopPartDragRef.current.startX;
        const steps = Math.round((dy + dx) / 8);
        const raw = loopPartDragRef.current.startValue + steps;
        const next = { ...getLoopLengthParts() };
        if (part === "bars") next.bars = raw;
        if (part === "beats") next.beats = raw;
        if (part === "sixteenths") next.sixteenths = raw;
        applyLoopLengthParts(next);
      };
      const onUp = () => {
        loopPartDragRef.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };
      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [applyLoopLengthParts, getLoopLengthParts],
  );

  const handleLoopPartKeyDown = useCallback(
    (part: "bars" | "beats" | "sixteenths", e: React.KeyboardEvent) => {
      let delta = 0;
      if (e.key === "ArrowUp" || e.key === "ArrowRight") delta = 1;
      else if (e.key === "ArrowDown" || e.key === "ArrowLeft") delta = -1;
      else return;
      e.preventDefault();
      const next = { ...getLoopLengthParts() };
      const maxBars = secondsPerBar > 0 ? Math.floor(duration / secondsPerBar) : 999;
      if (part === "bars") next.bars = Math.min(maxBars, Math.max(0, next.bars + delta));
      else if (part === "beats") next.beats = next.beats + delta;
      else if (part === "sixteenths") next.sixteenths = next.sixteenths + delta;
      applyLoopLengthParts(next);
    },
    [applyLoopLengthParts, duration, getLoopLengthParts, parsedTimeSignature.beatsPerBar, secondsPerBar],
  );

  const performExport = useCallback(
    async (markerOptions: ExportMarkerOptions | null) => {
      if (!filePath || !paneType) return;
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
      const clampedLoopStart = Math.max(0, Math.min(duration, loopStart));
      const clampedLoopEnd = Math.max(clampedLoopStart + 0.001, Math.min(duration, loopEnd || duration));
      // Use RegionsPlugin region if it exists; otherwise use loop start/end (user's start/end points)
      const regionBoundsStart = region ? regionStart : clampedLoopStart;
      const regionBoundsEnd = region ? regionEnd : clampedLoopEnd;
      const useFullSample = markerOptions === null ? false : !markerOptions.exportRegionOnly;
      const effectiveRegionStart = useFullSample ? 0 : regionBoundsStart;
      const effectiveRegionEnd = useFullSample ? duration : regionBoundsEnd;
      const pts = envelopeRef.current?.getPoints() ?? [];
      const envelopePoints = pts.length > 0 ? pts : undefined;
      const slices = displayedSlices.map((s) => ({ time: s.time }));
      const hasSlices = slices.length > 0;

      const statsResult = await fileSystemService.getFileStats(filePath, paneType);
      const willOverwrite = statsResult.success && statsResult.data;

      let saveAsTarget: { dirHandle: FileSystemDirectoryHandle; filename: string } | null = null;
      if (willOverwrite) {
        setExportOverwriteOpen(true);
        const choice = await new Promise<"abort" | "overwrite" | "saveAs">((resolve) => {
          exportOverwriteResolverRef.current = resolve;
        });
        if (choice === "abort") return;
        if (choice === "saveAs") {
          setExportSaveAsFilename(fileName ?? "export.wav");
          setExportSaveAsDirHandle(null);
          setExportSaveAsOpen(true);
          const result = await new Promise<{ dirHandle: FileSystemDirectoryHandle; filename: string } | null>(
            (resolve) => {
              exportSaveAsResolverRef.current = resolve;
            }
          );
          setExportSaveAsOpen(false);
          setExportSaveAsDirHandle(null);
          if (!result) return;
          saveAsTarget = result;
        }
      }

      setIsExporting(true);
      try {
        const bpmResult = parseBpmFromString(fileName ?? "");
        const tempo = Number.isFinite(tempoBpm) ? tempoBpm : bpmResult?.bpm;
        const parsedRootKey = Number.parseInt(rootKey.trim(), 10);
        const rootKeyValue =
          Number.isFinite(parsedRootKey) && parsedRootKey >= 0 && parsedRootKey <= 127 ? parsedRootKey : undefined;

        const params = {
          regionStart: effectiveRegionStart,
          regionEnd: effectiveRegionEnd,
          envelopePoints,
          slices: hasSlices ? slices : undefined,
          embeddedMarkers: hasSlices && (markerOptions?.embeddedMarkers ?? true),
          ixmlMetadata: markerOptions?.ixmlMetadata ?? true,
          exportSliceFiles: hasSlices && (markerOptions?.sliceFiles ?? false),
          tempo,
          timeSignature: timeSignature.trim() || undefined,
          sampleStart: clampedLoopStart,
          sampleEnd: clampedLoopEnd,
          rootKey: rootKeyValue,
          tuningCents,
        };

        const { mainBlob, sliceBlobs } = await exportAudioWithEdits(blob, params, duration);

        const mainFileName = saveAsTarget ? saveAsTarget.filename : (fileName ?? "export.wav");
        const mainName = mainFileName.replace(/\.wav$/i, "") + ".wav";

        if (saveAsTarget) {
          const result = await fileSystemService.writeBlobToDirectoryHandle(
            saveAsTarget.dirHandle,
            mainName,
            mainBlob
          );
          if (!result.success) {
            toast.error(result.error || "Export failed");
            return;
          }
          if (sliceBlobs && sliceBlobs.length > 0) {
            const baseName = mainFileName.replace(/\.wav$/i, "");
            const sliceFolderHandle = await saveAsTarget.dirHandle.getDirectoryHandle(baseName, {
              create: true,
            });
            const padWidth = Math.max(2, String(sliceBlobs.length).length);
            for (let i = 0; i < sliceBlobs.length; i++) {
              const num = String(i + 1).padStart(padWidth, "0");
              const sliceResult = await fileSystemService.writeBlobToDirectoryHandle(
                sliceFolderHandle,
                `${baseName}_${num}.wav`,
                sliceBlobs[i]
              );
              if (!sliceResult.success) {
                toast.error(sliceResult.error || `Failed to export slice ${i + 1}`);
                return;
              }
            }
            toast.success(`Exported ${mainName} and ${sliceBlobs.length} slices`);
          } else {
            toast.success(`Exported ${mainName}`);
          }
        } else {
          const result = await fileSystemService.writeBlobToPath(filePath, mainBlob, paneType);
          if (!result.success) {
            toast.error(result.error || "Export failed");
            return;
          }
          if (sliceBlobs && sliceBlobs.length > 0) {
            const baseName = (fileName ?? "export").replace(/\.wav$/i, "");
            const dirPath = filePath.substring(0, filePath.lastIndexOf("/")) || "/";
            const folderResult = await fileSystemService.createFolder(dirPath, baseName, paneType);
            if (!folderResult.success) {
              toast.error(folderResult.error || "Failed to create slice folder");
              return;
            }
            const sliceFolderPath = `${dirPath}/${baseName}`;
            const padWidth = Math.max(2, String(sliceBlobs.length).length);
            for (let i = 0; i < sliceBlobs.length; i++) {
              const num = String(i + 1).padStart(padWidth, "0");
              const slicePath = `${sliceFolderPath}/${baseName}_${num}.wav`;
              const sliceResult = await fileSystemService.writeBlobToPath(
                slicePath,
                sliceBlobs[i],
                paneType
              );
              if (!sliceResult.success) {
                toast.error(sliceResult.error || `Failed to export slice ${i + 1}`);
                return;
              }
            }
            toast.success(`Exported ${fileName} and ${sliceBlobs.length} slices`);
          } else {
            toast.success(`Exported ${fileName}`);
          }
          onFileSaved?.(paneType);
        }
      } catch (err) {
        toast.error(String(err));
      } finally {
        setIsExporting(false);
      }
    },
    [
      filePath,
      paneType,
      duration,
      fileName,
      displayedSlices,
      loopEnd,
      loopStart,
      onFileSaved,
      rootKey,
      tempoBpm,
      timeSignature,
      tuningCents,
    ]
  );

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
        paneType || "source",
      );
      if (result.success) {
        toast.success(`Exported ${safeName}`);
        onFileSaved?.(paneType || "source");
      } else {
        toast.error(result.error || "Export failed");
      }
      return;
    }

    const hasSlices = displayedSlices.length > 0;
    const regs = regionsRef.current?.getRegions() ?? [];
    const region = regs[0];
    const regionStart = region?.start ?? 0;
    const regionEnd = region?.end ?? duration;
    const loopStartClamped = Math.max(0, Math.min(duration, loopStart));
    const loopEndClamped = Math.max(loopStartClamped + 0.001, Math.min(duration, loopEnd || duration));
    // Show region option when: RegionsPlugin region exists, OR loop start/end differ from full (user's start/end points)
    const hasRegion =
      !!(region && (regionStart > 0 || regionEnd < duration)) ||
      loopStartClamped > 0 ||
      loopEndClamped < duration;

    if (hasSlices || hasRegion) {
      setExportOptionsOpen(true);
      return;
    }

    await performExport(null);
  };

  const handleExportOptionsConfirm = useCallback(() => {
    setExportOptionsOpen(false);
    performExport(exportMarkerOptions);
  }, [exportMarkerOptions, performExport]);

  const handleExportOverwriteChoice = (choice: "abort" | "overwrite" | "saveAs") => {
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

      if (dragStateRef.current.isMinimapDrag) {
        const actualDeltaX = e.clientX - dragStateRef.current.startX;
        const actualDeltaY = e.clientY - dragStateRef.current.startY;
        // Horizontal: scroll visible area - drag right = scroll right, drag left = scroll left
        try {
          const ws = wavesurferRef.current;
          if (typeof ws.getScroll === "function" && typeof ws.setScroll === "function") {
            const overlayEl = minimapContainerRef.current?.querySelector(
              '[part="minimap-overlay"]',
            ) as HTMLElement | null;
            const minimapRect = minimapContainerRef.current?.getBoundingClientRect();
            const waveformRect = waveformRef.current?.getBoundingClientRect();
            const overlayLeftBefore =
              overlayEl && minimapRect ? overlayEl.getBoundingClientRect().left - minimapRect.left : null;
            const scrollBefore = ws.getScroll();
            // Axis lock: ignore tiny/secondary horizontal jitter during mostly vertical drags.
            const shouldApplyHorizontal =
              Math.abs(actualDeltaX) >= Math.abs(actualDeltaY) && Math.abs(actualDeltaX) >= 2;
            // Map mouse pixels to minimap overlay pixels (~1:1 feel): one mouse px moves overlay by one px.
            // dScroll = dOverlay * (visibleWindowPx / overlayWidthPx)
            const overlayWidth = overlayEl?.getBoundingClientRect().width ?? 0;
            const visibleWindow = waveformRect?.width ?? 0;
            const minimapPixelToScroll = overlayWidth > 0 && visibleWindow > 0 ? visibleWindow / overlayWidth : 1;
            const mappedDeltaX = shouldApplyHorizontal ? actualDeltaX * minimapPixelToScroll : 0;
            const newScroll = Math.max(0, dragStateRef.current.startScroll + mappedDeltaX);
            ws.setScroll(newScroll);
            const overlayLeftAfter =
              overlayEl && minimapRect ? overlayEl.getBoundingClientRect().left - minimapRect.left : null;
            if (dragStateRef.current.debugScrollSamples < 6) {
              dragStateRef.current.debugScrollSamples += 1;
            }
          }
        } catch {
          /* scroll API may not exist */
        }
        // Vertical zoom on minimap drag (including overlay) so zoom-out is always reachable.
        // Keep zoom response linear/predictable in both directions.
        const zoomPerPixel = 0.8;
        const zoomDelta = -actualDeltaY * zoomPerPixel;
        const newZoom = Math.max(0, Math.min(500, dragStateRef.current.startZoom + zoomDelta));
        if (dragStateRef.current.debugMoveSamples < 3) {
          dragStateRef.current.debugMoveSamples += 1;
        }
        setZoom(newZoom);
      }
      // Main waveform: no zoom on drag (zoom only via minimap)
    };

    const handleMouseUp = (e: MouseEvent) => {
      const state = dragStateRef.current;
      dragStateRef.current = null;
      // Minimap click (no drag): seek to position.
      if (
        state &&
        state.isMinimapDrag &&
        state.shouldSeekOnMouseUp &&
        !state.hasMoved &&
        minimapContainerRef.current &&
        wavesurferRef.current &&
        !isLoading
      ) {
        const rect = minimapContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        if (width > 0) {
          const relativeX = Math.max(0, Math.min(1, x / width));
          wavesurferRef.current.seekTo(relativeX);
        }
        return;
      }
      // If it was a click (no drag) on the main waveform: add slice if we have slice markers, else seek
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
            const clickTime = (x / width) * currentDuration;
            if (addMarkerModeRef.current) {
              addSliceAtTimeRef.current(clickTime);
            } else if (slicingOpen && sliceMarkersRef.current.length > 0) {
              addSliceAtTimeRef.current(clickTime);
            } else {
              wavesurferRef.current.seekTo(clickTime / currentDuration);
            }
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
  }, [slicingOpen]);

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

  const loopLengthParts = getLoopLengthParts();
  const totalBars = useMemo(() => {
    if (secondsPerBar <= 0 || duration <= 0) return 0;
    return Math.min(512, Math.ceil(duration / secondsPerBar));
  }, [duration, secondsPerBar]);
  const timelineDuration = duration > 0 ? duration : 1;
  const loopEndClamped = Math.min(timelineDuration, loopEnd > 0 ? loopEnd : timelineDuration);
  const loopStartClamped = Math.max(0, Math.min(loopEndClamped - 0.001, loopStart));
  const playStartClamped = Math.max(loopStartClamped, Math.min(loopEndClamped, playStart));

  return (
    <div className="border-t border-border bg-card p-4 space-y-3 shrink-0" data-testid={`audio-preview-${paneType}`}>
      {/* Resize handle - top border of filename row, drag to adjust waveform height */}
      <div
        className="-mt-4 -mx-4 mb-1 h-4 cursor-ns-resize flex items-center justify-center hover:bg-muted/50 transition-colors select-none touch-none"
        onMouseDown={handleResizeMouseDown}
        title="Drag to resize"
      >
        <div className="flex h-3 w-4 items-center justify-center rounded-sm border bg-border">
          <GripHorizontal className="h-2.5 w-2.5" />
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span
            data-testid="audio-preview-filename"
            title={fileName ?? "Waveform Editor"}
            className="block max-w-full text-sm font-semibold uppercase tracking-wide text-muted-foreground truncate"
          >
            {fileName ? `${fileName}` : "Waveform Editor"}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap">
          {!isEmptyState && duration > 0 && (
            <>
              {devMode && sampleRate > 0 && (
                <div
                  className="text-[10px] font-mono text-muted-foreground"
                  title="Loop length in samples"
                >
                  {Math.round(Math.max(0, (loopEnd || duration) - loopStart) * sampleRate).toLocaleString()}
                </div>
              )}
              <div className="text-[10px] uppercase text-muted-foreground">Len</div>
              <div
                role="group"
                aria-label="Loop length (bars : beats : sixteenths)"
                className="h-7 w-[8.5rem] flex items-center rounded-md border border-input bg-background text-xs font-mono select-none"
              >
                <span
                  role="spinbutton"
                  tabIndex={0}
                  data-testid="loop-length-bars"
                  aria-label="Loop length bars"
                  aria-valuenow={loopLengthParts.bars}
                  aria-valuemin={0}
                  aria-valuemax={secondsPerBar > 0 ? Math.floor(duration / secondsPerBar) : 999}
                  className="w-6 shrink-0 flex items-center justify-center cursor-move hover:bg-muted/50 rounded-l-[5px]"
                  onMouseDown={(e) => handleLoopPartDragStart("bars", e)}
                  onKeyDown={(e) => handleLoopPartKeyDown("bars", e)}
                  title="Drag or use arrow keys to adjust loop bars"
                >
                  {String(loopLengthParts.bars).padStart(3, " ")}
                </span>
                <span className="w-3 shrink-0 flex items-center justify-center text-muted-foreground">:</span>
                <span
                  role="spinbutton"
                  tabIndex={0}
                  data-testid="loop-length-beats"
                  aria-label="Loop length beats"
                  aria-valuenow={loopLengthParts.beats}
                  aria-valuemin={0}
                  aria-valuemax={parsedTimeSignature.beatsPerBar - 1}
                  className="w-6 shrink-0 flex items-center justify-center cursor-move hover:bg-muted/50"
                  onMouseDown={(e) => handleLoopPartDragStart("beats", e)}
                  onKeyDown={(e) => handleLoopPartKeyDown("beats", e)}
                  title="Drag or use arrow keys to adjust loop beats"
                >
                  {String(loopLengthParts.beats).padStart(2, " ")}
                </span>
                <span className="w-3 shrink-0 flex items-center justify-center text-muted-foreground">:</span>
                <span
                  role="spinbutton"
                  tabIndex={0}
                  data-testid="loop-length-sixteenths"
                  aria-label="Loop length sixteenths"
                  aria-valuenow={loopLengthParts.sixteenths}
                  aria-valuemin={0}
                  aria-valuemax={3}
                  className="w-6 shrink-0 flex items-center justify-center cursor-move hover:bg-muted/50 rounded-r-[5px]"
                  onMouseDown={(e) => handleLoopPartDragStart("sixteenths", e)}
                  onKeyDown={(e) => handleLoopPartKeyDown("sixteenths", e)}
                  title="Drag or use arrow keys to adjust loop sixteenths"
                >
                  {String(loopLengthParts.sixteenths).padStart(2, " ")}
                </span>
              </div>
              <Button
                size="sm"
                variant={loopEnabled ? "default" : "outline"}
                className="h-7 w-7 p-0 shrink-0"
                onClick={() => setLoopEnabled(!loopEnabled)}
                disabled={isLoading}
                title={loopEnabled ? "Loop on: playback loops within region" : "Loop off: playback stops at region end"}
                aria-pressed={loopEnabled}
              >
                <Repeat className="w-3.5 h-3.5" />
              </Button>
              <Input
                data-testid="audio-preview-time-signature"
                className="h-7 w-[78px] text-xs font-mono"
                value={timeSignature}
                onChange={(e) => setTimeSignature(e.target.value)}
                disabled={isLoading}
                title="Time signature"
              />
              <Input
                data-testid="audio-preview-tempo"
                className="h-7 w-[68px] text-xs font-mono"
                inputMode="numeric"
                value={tempoEditingValue ?? String(Math.round(tempoBpm))}
                onFocus={() => setTempoEditingValue(String(Math.round(tempoBpm)))}
                onChange={(e) => setTempoEditingValue(e.target.value)}
                onBlur={() => {
                  const n = Number.parseFloat(tempoEditingValue ?? "");
                  if (Number.isFinite(n) && n >= 50 && n <= 240) setTempoBpm(n);
                  setTempoEditingValue(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                }}
                disabled={isLoading}
                title="Tempo BPM"
              />
              <Input
                data-testid="audio-preview-root-key"
                className="h-7 w-[60px] text-xs font-mono"
                value={rootKey}
                onChange={(e) => setRootKey(e.target.value)}
                disabled={isLoading}
                title="Root key (MIDI 0-127)"
                placeholder="Root"
              />
              <Input
                data-testid="audio-preview-tuning-cents"
                className="h-7 w-[70px] text-xs font-mono"
                value={Number.isFinite(tuningCents) ? tuningCents.toFixed(2) : "0.00"}
                onChange={(e) => {
                  const v = Number.parseFloat(e.target.value);
                  if (Number.isFinite(v)) setTuningCents(v);
                }}
                disabled={isLoading}
                title="Tuning cents"
                placeholder="Tune"
              />
            </>
          )}
          {slicingOpen && !isEmptyState && duration > 0 && (
            <>
              <div
                role="spinbutton"
                aria-valuenow={numSlices}
                aria-valuemin={1}
                aria-valuemax={Math.max(1, sliceMarkers.length)}
                tabIndex={0}
                onMouseDown={handleNumSlicesDragStart}
                className="h-7 min-w-10 px-2 flex items-center justify-center rounded-md border border-input bg-background text-xs font-mono cursor-move select-none hover:bg-muted/50"
                title="Drag up/right to increase, down/left to decrease"
              >
                {numSlices} slices
              </div>
              <Select
                value={sliceDetectionMode}
                onValueChange={(v) => setSliceDetectionMode(v as SliceDetectionMode)}
                disabled={isLoading || isAnalyzing}
              >
                <SelectTrigger className="h-7 w-[90px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="transient">Transient</SelectItem>
                  <SelectItem value="pitch">Pitch</SelectItem>
                  <SelectItem value="both">Both</SelectItem>
                </SelectContent>
              </Select>
              {isAnalyzing && <span className="text-xs text-muted-foreground">Analyzing…</span>}
              <Button
                size="sm"
                variant={addMarkerMode ? "default" : "outline"}
                className="h-7 text-xs gap-1"
                onClick={() => setAddMarkerMode(!addMarkerMode)}
                disabled={isLoading}
                title="Tap waveform to add marker"
              >
                <MapIcon className="w-3 h-3" />
                Add Marker
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant={slicingOpen ? "default" : "outline"}
            className="h-7 text-xs"
            onClick={() => setSlicingOpen(!slicingOpen)}
            disabled={isEmptyState || isLoading}
            title="Show slice markers on waveform"
          >
            Slicing
          </Button>
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
      <div className="relative overflow-hidden" style={{ minHeight: debouncedWaveformHeight + 60 }}>
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
        {!isEmptyState && duration > 0 && timeDisplayMode === "bars" && totalBars > 0 && (
          <div
            data-testid="audio-preview-bar-background"
            className="absolute top-0 left-0 right-0 z-[2] pointer-events-none"
            style={{ height: debouncedWaveformHeight }}
          >
            {Array.from({ length: totalBars }).map((_, i) => (
              <div
                key={`bar-bg-${i}`}
                className="absolute top-0 h-full"
                style={{
                  left: `${(i / totalBars) * 100}%`,
                  width: `${100 / totalBars}%`,
                  backgroundColor: i % 2 === 0 ? "rgba(90,90,90,0.07)" : "rgba(120,120,120,0.11)",
                }}
              />
            ))}
          </div>
        )}
        {!isEmptyState && !isLoading && duration > 0 && (
          <div
            className="absolute left-0 right-0 top-0 z-[12] pointer-events-none"
            style={{ height: debouncedWaveformHeight }}
            data-testid="sample-range-overlay"
          >
            <div
              className="absolute top-1 h-2 rounded-sm bg-[#2D193E]"
              style={{
                left: `${(loopStartClamped / timelineDuration) * 100}%`,
                width: `${(Math.max(0.001, loopEndClamped - loopStartClamped) / timelineDuration) * 100}%`,
              }}
              data-testid="sample-range-bar"
            />
            <button
              type="button"
              aria-label="Sample range start"
              className="absolute top-1 h-2 -translate-x-1/2 pointer-events-auto cursor-ew-resize p-0 bg-transparent border-0 min-w-[24px] flex items-center justify-center overflow-visible"
              style={{ left: `${(loopStartClamped / timelineDuration) * 100}%` }}
              onMouseDown={(e) => handleLoopBoundaryDrag("start", e)}
              data-testid="sample-range-start-handle"
              title="Loop start (hold Shift to nudge loop)"
            >
              <span
                className="block w-0 h-0 border-t-[4px] border-b-[4px] border-l-[8px] border-t-transparent border-b-transparent border-l-[#D3D3D3] shrink-0"
                title="Sample start"
              />
            </button>
            <button
              type="button"
              aria-label="Play start"
              className="absolute top-3 -translate-x-1/2 pointer-events-auto cursor-ew-resize p-0 bg-transparent border-0"
              style={{ left: `${(playStartClamped / timelineDuration) * 100}%` }}
              onMouseDown={(e) => handleSampleBoundaryDrag("play", e)}
              data-testid="sample-range-play-start-handle"
            >
              <span
                className="block w-0 h-0 border-l-[6px] border-r-[6px] border-b-[8px] border-l-transparent border-r-transparent border-b-[#D3D3D3]"
                title="Play start"
              />
            </button>
            <button
              type="button"
              aria-label="Sample range end"
              className="absolute top-1 h-2 -translate-x-1/2 pointer-events-auto cursor-ew-resize p-0 bg-transparent border-0 min-w-[24px] flex items-center justify-center overflow-visible"
              style={{ left: `${(loopEndClamped / timelineDuration) * 100}%` }}
              onMouseDown={(e) => handleLoopBoundaryDrag("end", e)}
              data-testid="sample-range-end-handle"
              title="Loop end (hold Shift to nudge loop)"
            >
              <span
                className="block w-0 h-0 border-t-[4px] border-b-[4px] border-r-[8px] border-t-transparent border-b-transparent border-r-[#D3D3D3] shrink-0"
                title="Sample end"
              />
            </button>
          </div>
        )}
        {!isEmptyState && duration > 0 && (
          <div className="absolute top-0 left-0 right-0 z-[6] pointer-events-none" style={{ height: debouncedWaveformHeight }}>
            <div
              className="absolute top-0 left-0 h-full"
              style={{ width: `${(Math.max(0, loopStart) / duration) * 100}%`, backgroundColor: "rgba(0,0,0,0.28)" }}
            />
            <div
              className="absolute top-0 right-0 h-full"
              style={{ width: `${((duration - Math.min(duration, loopEnd || duration)) / duration) * 100}%`, backgroundColor: "rgba(0,0,0,0.28)" }}
            />
          </div>
        )}
        {/* Playhead overlay with dragger handle - only when we have audio */}
        {!isEmptyState && duration > 0 && (
          <div
            className="absolute top-0 left-0 w-0.5 pointer-events-none z-10"
            style={{
              left: `${(currentTime / duration) * 100}%`,
              height: debouncedWaveformHeight,
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
        {/* Slice markers overlay - pointer-events-none on container so waveform receives taps; auto on markers for remove/drag */}
        {slicingOpen && !isEmptyState && duration > 0 && displayedSlices.length > 0 && (
          <div
            className="absolute top-0 left-0 right-0 z-[5] pointer-events-none"
            style={{ height: debouncedWaveformHeight }}
          >
            {displayedSlices.map((slice, i) => {
              const key = sliceKey(slice.originalTime);
              const isHovered = hoveredSliceKey === key;
              return (
                <div
                  key={`${key}-${i}`}
                  className="absolute top-0 h-full flex flex-col items-center pointer-events-auto"
                  style={{
                    left: `${(slice.time / duration) * 100}%`,
                    transform: "translateX(-50%)",
                    width: 16,
                  }}
                  onMouseEnter={() => setHoveredSliceKey(key)}
                  onMouseLeave={() => setHoveredSliceKey(null)}
                >
                  <div
                    className="absolute top-0 w-0.5 h-full pointer-events-none"
                    style={{ left: "50%", transform: "translateX(-50%)", backgroundColor: "rgba(255, 118, 77, 0.5)" }}
                  />
                  {isHovered && (
                    <>
                      <button
                        type="button"
                        className="absolute bottom-1 left-1/2 -translate-x-1/2 z-10 w-5 h-5 rounded flex items-center justify-center bg-background border border-border shadow-sm hover:bg-destructive/10 hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSlice(slice.originalTime, slice.isUserAdded);
                        }}
                        title="Remove slice"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        className="absolute top-6 left-1/2 -translate-x-1/2 z-10 w-5 h-5 rounded flex items-center justify-center bg-background border border-border shadow-sm hover:bg-primary/10 hover:text-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          playSlice(i);
                        }}
                        title="Play slice"
                      >
                        <Play className="w-3 h-3" />
                      </button>
                      <div
                        className="absolute top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2 w-6 h-6 rounded flex items-center justify-center bg-background/90 border border-border shadow-sm cursor-ew-resize z-10"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          const startX = e.clientX;
                          const startTime = slice.time;
                          const handleMove = (moveE: MouseEvent) => {
                            const rect = waveformRef.current?.getBoundingClientRect();
                            if (!rect) return;
                            const dx = moveE.clientX - startX;
                            const timeDelta = (dx / rect.width) * duration;
                            const newTime = Math.max(0, Math.min(duration, startTime + timeDelta));
                            updateSlicePosition(slice.originalTime, newTime);
                          };
                          const handleUp = () => {
                            window.removeEventListener("mousemove", handleMove);
                            window.removeEventListener("mouseup", handleUp);
                          };
                          window.addEventListener("mousemove", handleMove);
                          window.addEventListener("mouseup", handleUp);
                        }}
                        title="Drag to reposition"
                      >
                        <GripVertical className="w-3 h-3 text-muted-foreground" />
                      </div>
                    </>
                  )}
                </div>
              );
            })}
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
            variant={isRecordArmed && recordArmedMode === "replace" ? "default" : "outline"}
            className="h-8 gap-1 shrink-0"
            onClick={handleRecordClick}
            disabled={isLoading}
            title={
              isRecording
                ? "Disarm (stop recording, keep audio)"
                : isRecordArmed
                  ? "Armed: Play to start recording"
                  : "Arm record (Play to start) or tap while playing to record"
            }
          >
            <Mic className="w-4 h-4" />
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
          <Button
            size="sm"
            variant={isRecordArmed && recordArmedMode === "overdub" ? "default" : "outline"}
            className="h-8 gap-1 shrink-0"
            onClick={handleOverdubClick}
            disabled={isLoading}
            title={
              isRecording
                ? "Disarm (stop recording, keep audio)"
                : isRecordArmed
                  ? "Armed: Play to start overdub"
                  : "Arm overdub (record on top without replacing)"
            }
          >
            <Layers className="w-4 h-4" />
            Overdub
          </Button>
        </div>

        {/* Time Display */}
        <div
          className="flex items-center gap-2 text-xs text-muted-foreground font-mono shrink-0"
          style={{ minWidth: "130px" }}
        >
          <span data-testid="audio-preview-current-time">
            {timeDisplayMode === "bars" ? formatBarsBeats(currentTime) : formatTime(currentTime)}
          </span>
          <span>/</span>
          <span data-testid="audio-preview-total-time">
            {timeDisplayMode === "bars" ? formatBarsBeats(duration) : formatTime(duration)}
          </span>
          <Select value={timeDisplayMode} onValueChange={(v) => setTimeDisplayMode(v as "clock" | "bars")}>
            <SelectTrigger data-testid="audio-preview-time-mode" className="h-7 w-[84px] text-[11px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="clock">Clock</SelectItem>
              <SelectItem value="bars">Bars/Beats</SelectItem>
            </SelectContent>
          </Select>
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

        {/* Microphone device selection */}
        <div className="flex items-center gap-2 shrink-0">
          <Label htmlFor="audio-device" className="text-xs text-muted-foreground shrink-0 sr-only">
            Input device
          </Label>
          <Button size="sm" variant="outline" className="h-7 text-xs shrink-0" onClick={refreshAudioDevices}>
            Refresh
          </Button>
          {audioDevices.length > 0 && (
            <Select value={selectedDeviceId} onValueChange={setSelectedDeviceId}>
              <SelectTrigger id="audio-device" className="h-7 w-[160px]">
                <SelectValue placeholder="Input device" />
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
        </div>

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
          data-testid="audio-preview-export-button"
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

        {/* Info */}
        {!isEmptyState && filePath && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 w-7 p-0 shrink-0"
            onClick={async () => {
              setInfoOpen(true);
              if (!audioUrl) return;
              try {
                const res = await fetch(audioUrl);
                const blob = await res.blob();
                const info = await getAudioFileInfo(blob);
                setAudioFileInfo(info);
              } catch {
                setAudioFileInfo(null);
              }
            }}
            disabled={isLoading}
            title="Sample file info"
          >
            <Info className="w-3.5 h-3.5" />
          </Button>
        )}

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
                  <span className="text-xs text-muted-foreground font-mono min-w-[40px]">
                    {playbackRate.toFixed(2)}x
                  </span>
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={clearRegions}
                    disabled={isLoading}
                  >
                    Clear Regions
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={clearMarkers}
                    disabled={isLoading}
                  >
                    Clear Markers
                  </Button>
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

      {/* Save As dialog - choose folder and filename when exporting to a different location */}
      <Dialog
        open={exportSaveAsOpen}
        onOpenChange={(open) => {
          if (!open) {
            exportSaveAsResolverRef.current?.(null);
            exportSaveAsResolverRef.current = null;
            setExportSaveAsDirHandle(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Choose Save Location</DialogTitle>
            <DialogDescription>
              Pick a folder and enter a filename to export the sample to a different location.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Folder</Label>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-start"
                onClick={async () => {
                  const result = await fileSystemService.pickDirectoryForSaveAs();
                  if (result.success && result.data) {
                    setExportSaveAsDirHandle(result.data);
                  } else if (!result.cancelled && result.error) {
                    toast.error(result.error);
                  }
                }}
              >
                {exportSaveAsDirHandle ? (
                  <span className="truncate">{exportSaveAsDirHandle.name}</span>
                ) : (
                  "Choose folder…"
                )}
              </Button>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="export-saveas-filename">Filename</Label>
              <Input
                id="export-saveas-filename"
                value={exportSaveAsFilename}
                onChange={(e) => setExportSaveAsFilename(e.target.value)}
                placeholder="export.wav"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && exportSaveAsDirHandle && exportSaveAsFilename.trim()) {
                    const name = exportSaveAsFilename.trim().replace(/\.wav$/i, "") + ".wav";
                    exportSaveAsResolverRef.current?.({ dirHandle: exportSaveAsDirHandle, filename: name });
                    exportSaveAsResolverRef.current = null;
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                exportSaveAsResolverRef.current?.(null);
                exportSaveAsResolverRef.current = null;
                setExportSaveAsDirHandle(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                const name = exportSaveAsFilename.trim().replace(/\.wav$/i, "") + ".wav";
                exportSaveAsResolverRef.current?.({ dirHandle: exportSaveAsDirHandle!, filename: name });
                exportSaveAsResolverRef.current = null;
              }}
              disabled={!exportSaveAsDirHandle || !exportSaveAsFilename.trim()}
            >
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ExportOptionsDialog
        open={exportOptionsOpen}
        onOpenChange={setExportOptionsOpen}
        options={exportMarkerOptions}
        onOptionsChange={setExportMarkerOptions}
        onConfirm={handleExportOptionsConfirm}
        showRegionOption={(() => {
          const regs = regionsRef.current?.getRegions() ?? [];
          const r = regs[0];
          const rStart = r?.start ?? 0;
          const rEnd = r?.end ?? duration;
          const lStart = Math.max(0, Math.min(duration, loopStart));
          const lEnd = Math.max(lStart + 0.001, Math.min(duration, loopEnd || duration));
          return !!(r && (rStart > 0 || rEnd < duration)) || lStart > 0 || lEnd < duration;
        })()}
        showSliceOptions={displayedSlices.length > 0}
      />

      {/* Sample file info dialog */}
      <Dialog open={infoOpen} onOpenChange={setInfoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sample Info</DialogTitle>
            <DialogDescription>
              {fileName ?? "Audio file"} — technical details
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 font-mono text-sm">
            {audioFileInfo ? (
              <>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-muted-foreground">Sample rate</span>
                  <span>{audioFileInfo.sampleRate.toLocaleString()} Hz</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-muted-foreground">Channels</span>
                  <span>{audioFileInfo.numChannels === 1 ? "Mono" : audioFileInfo.numChannels === 2 ? "Stereo" : `${audioFileInfo.numChannels} ch`}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-muted-foreground">Bit depth</span>
                  <span>{audioFileInfo.bitsPerSample != null ? `${audioFileInfo.bitsPerSample}-bit` : "—"}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-muted-foreground">Total samples</span>
                  <span>{audioFileInfo.totalSamples.toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-muted-foreground">Total frames</span>
                  <span>{audioFileInfo.totalFrames.toLocaleString()}</span>
                </div>
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-muted-foreground">Duration</span>
                  <span>{audioFileInfo.durationSeconds.toFixed(3)} s</span>
                </div>
                {audioFileInfo.fileSizeBytes != null && (
                  <div className="grid grid-cols-[140px_1fr] gap-2">
                    <span className="text-muted-foreground">File size</span>
                    <span>{formatBytes(audioFileInfo.fileSizeBytes)}</span>
                  </div>
                )}
                <div className="grid grid-cols-[140px_1fr] gap-2">
                  <span className="text-muted-foreground">Format</span>
                  <span>{audioFileInfo.format}</span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground">Loading…</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

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
