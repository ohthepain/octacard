/**
 * Unified playback engine: single and multi mode, Web Audio, sample-accurate looping,
 * envelope, loop on/off. Used by both waveform editor and multi-sample stack.
 */

import { fileSystemService } from "./fileSystem";
import { useSampleEditsStore } from "@/stores/sample-edits-store";
import { usePlayerStore } from "@/stores/player-store";
import type { PaneType } from "@/stores/multi-sample-store";
import type { EnvelopePoint } from "@/stores/sample-edits-store";

function getGainAtTime(points: EnvelopePoint[], time: number): number {
  if (!points.length) return 1;
  if (points.length === 1) return points[0].volume;
  if (time <= points[0].time) return points[0].volume;
  if (time >= points[points.length - 1].time) return points[points.length - 1].volume;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (time >= a.time && time <= b.time) {
      const t = (time - a.time) / (b.time - a.time);
      return a.volume + t * (b.volume - a.volume);
    }
  }
  return 1;
}

export interface PlaybackSample {
  id: string;
  path: string;
  paneType: PaneType;
  bpm?: number;
  duration?: number;
}

export interface PlaybackHandle {
  stop: () => void;
  /** Stop without calling onEnded (for restart). */
  stopSilent: () => void;
  /**
   * Compute the correct playhead position for a new loop length, preserving phase.
   * Returns overridePlayStart (seconds) if this sample is playing, else null.
   */
  getRestartPosition: (path: string, newLoopStart: number, newLoopEnd: number) => number | null;
}

/**
 * Start unified playback. Single or multi mode.
 */
export async function startUnifiedPlayback(
  mode: "single" | "multi",
  samples: PlaybackSample[],
  options: {
    volume?: number;
    playbackRate?: number;
    globalTempoBpm?: number;
    /** Override initial play position (for restart after loop length change) */
    overridePlayStart?: Record<string, number>;
    onTimeUpdate?: (sampleId: string, currentTime: number) => void;
    onPositionsUpdate?: (positions: Record<string, number>) => void;
    onEnded?: () => void;
  }
): Promise<PlaybackHandle> {
  const { volume = 1, playbackRate = 1, globalTempoBpm = 120, overridePlayStart, onTimeUpdate, onPositionsUpdate, onEnded } = options;
  const getEdits = useSampleEditsStore.getState().getEdits;
  const setCurrentTime = usePlayerStore.getState().setCurrentTime;
  const setPlaying = (v: boolean) => usePlayerStore.setState({ isPlaying: v });

  if (samples.length === 0) {
    onEnded?.();
    return { stop: () => {} };
  }

  const ctx = new AudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = volume;
  masterGain.connect(ctx.destination);

  const pathToSampleId = new Map<string, string>();
  for (const s of samples) pathToSampleId.set(s.path, s.id);

  const sources: {
    source: AudioBufferSourceNode;
    sampleId: string;
    path: string;
    loopStart: number;
    loopEnd: number;
    playStart: number;
    loopEnabled: boolean;
    envelopePoints: EnvelopePoint[];
    bufferDuration: number;
    playbackRate: number;
    loopDuration: number;
    playDuration: number; // loopEnd - playStart, for loop-off duration
  }[] = [];
  let rafId = 0;
  let stopped = false;
  const startTimes: Map<string, number> = new Map();
  let endedCount = 0;
  let onEndedCalled = false;

  function callOnEnded() {
    if (onEndedCalled) return;
    onEndedCalled = true;
    setPlaying(false);
    setCurrentTime(0);
    ctx.close();
    onEnded?.();
  }

  for (const sample of samples) {
    const result = await fileSystemService.getAudioFileBlob(sample.path, sample.paneType);
    if (!result.success || !result.data) continue;

    const res = await fetch(result.data);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    const bufferDuration = buffer.duration;

    const edits = getEdits(sample.path);
    const region = edits?.region;
    const regionStart = region?.start ?? 0;
    const regionEnd = region?.end ?? bufferDuration;
    const loopStart = edits?.loopStart ?? regionStart;
    const loopEnd = edits?.loopEnd ?? regionEnd;
    const playStart = overridePlayStart?.[sample.path] ?? edits?.playStart ?? loopStart;
    const loopEnabled = edits?.loopEnabled ?? true;
    const envelopePoints = edits?.envelopePoints ?? [];

    const sr = buffer.sampleRate;
    const loopStartSample = Math.max(0, Math.floor(loopStart * sr));
    const loopEndSample = Math.max(loopStartSample + 1, Math.min(buffer.length, Math.ceil(loopEnd * sr)));
    const playStartSample = Math.max(loopStartSample, Math.min(loopEndSample - 1, Math.floor(playStart * sr)));
    const loopStartExact = loopStartSample / sr;
    const loopEndExact = loopEndSample / sr;
    const playStartExact = playStartSample / sr;
    const loopDurationExact = loopEndExact - loopStartExact;

    const sampleBpm = sample.bpm ?? 120;
    const rate = mode === "multi" ? globalTempoBpm / sampleBpm : playbackRate;

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = rate;
    if (loopEnabled) {
      source.loop = true;
      source.loopStart = loopStartExact;
      source.loopEnd = loopEndExact;
    }

    const gainNode = ctx.createGain();
    const playDuration = loopEndExact - playStartExact;
    if (envelopePoints.length > 0) {
      const envInterval = 0.01;
      let lastGain = getGainAtTime(envelopePoints, playStartExact) * volume;
      gainNode.gain.setValueAtTime(lastGain, 0);
      for (let bufT = envInterval; bufT < playDuration; bufT += envInterval) {
        const bufTime = playStartExact + bufT;
        const gain = getGainAtTime(envelopePoints, bufTime) * volume;
        const outTime = bufT / rate;
        gainNode.gain.linearRampToValueAtTime(gain, outTime);
        lastGain = gain;
      }
      gainNode.gain.setValueAtTime(getGainAtTime(envelopePoints, loopEndExact) * volume, playDuration / rate);
    } else {
      gainNode.gain.value = volume;
    }
    source.connect(gainNode);
    gainNode.connect(masterGain);

    const startTime = ctx.currentTime;
    startTimes.set(sample.id, startTime);
    const duration = loopEndExact - playStartExact;
    if (loopEnabled) {
      source.start(0, playStartExact);
    } else {
      source.start(0, playStartExact, duration);
      source.stop(duration);
      source.onended = () => {
        endedCount++;
        if (mode === "single" || endedCount >= samples.length) {
          callOnEnded();
        }
      };
    }

    sources.push({
      source,
      sampleId: sample.id,
      path: sample.path,
      loopStart: loopStartExact,
      loopEnd: loopEndExact,
      playStart: playStartExact,
      loopEnabled,
      envelopePoints,
      bufferDuration,
      playbackRate: rate,
      loopDuration: loopDurationExact,
      playDuration: duration,
    });
  }

  const activeSampleId = usePlayerStore.getState().activeSampleId ?? samples[0]?.id ?? null;

  const tick = () => {
    if (stopped) return;
    const now = ctx.currentTime;
    const currentActiveId = usePlayerStore.getState().activeSampleId ?? activeSampleId;
    const positions: Record<string, number> = {};
    for (const s of sources) {
      const startTime = startTimes.get(s.sampleId) ?? now;
      const elapsed = now - startTime;
      if (!s.loopEnabled) {
        const maxElapsed = s.playDuration / s.playbackRate;
        if (elapsed >= maxElapsed) continue;
      }
      const loopDuration = s.loopEnd - s.loopStart;
      const posInLoop = ((s.playStart - s.loopStart + elapsed) % loopDuration + loopDuration) % loopDuration;
      const currentTimeSec = s.loopStart + posInLoop;
      positions[s.sampleId] = currentTimeSec;
      if (s.sampleId === currentActiveId) {
        setCurrentTime(currentTimeSec);
      }
      onTimeUpdate?.(s.sampleId, currentTimeSec);
    }
    onPositionsUpdate?.(positions);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  function stopSilentImpl() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(rafId);
    for (const s of sources) {
      try {
        s.source.stop();
      } catch {
        // ignore
      }
    }
    ctx.close();
  }

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(rafId);
      for (const s of sources) {
        try {
          s.source.stop();
        } catch {
          // ignore
        }
      }
      callOnEnded();
    },
    stopSilent: stopSilentImpl,
    getRestartPosition: (path: string, newLoopStart: number, newLoopEnd: number): number | null => {
      if (stopped) return null;
      const sampleId = pathToSampleId.get(path);
      if (!sampleId) return null;
      const s = sources.find((src) => src.path === path);
      if (!s || !s.loopEnabled) return null;
      const startTime = startTimes.get(sampleId);
      if (startTime == null) return null;
      const now = ctx.currentTime;
      const elapsed = now - startTime;
      const elapsedInBuffer = elapsed * s.playbackRate;
      const oldLoopDuration = s.loopEnd - s.loopStart;
      const posInOldLoop = ((s.playStart - s.loopStart + elapsedInBuffer) % oldLoopDuration + oldLoopDuration) % oldLoopDuration;
      const newLoopDuration = Math.max(0.001, newLoopEnd - newLoopStart);
      const posInNewLoop = posInOldLoop % newLoopDuration;
      const newPos = newLoopStart + posInNewLoop;
      return newPos;
    },
  };
}
