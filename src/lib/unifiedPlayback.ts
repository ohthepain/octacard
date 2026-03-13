/**
 * Unified playback engine: single and multi mode, Web Audio, sample-accurate looping,
 * envelope, loop on/off. Used by both waveform editor and multi-sample stack.
 */

import { fileSystemService } from "./fileSystem";
import { ensureAudioDecodable } from "./audioConverter";
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
  /**
   * Schedule switch to a new sample at the next bar boundary (single mode only, sample-accurate).
   * Returns a promise that resolves when the switch is scheduled.
   */
  scheduleSwitchAtNextBar: (path: string, paneType: PaneType) => Promise<void>;
  /**
   * Update volume for a specific sample in real-time (does not interrupt playback).
   */
  setSampleVolume: (sampleId: string, volume: number) => void;
  /**
   * Update master volume in real-time (does not interrupt playback).
   */
  setMasterVolume: (volume: number) => void;
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
    /** Per-sample volume overrides (sampleId -> volume 0-1) */
    sampleVolumes?: Record<string, number>;
    onTimeUpdate?: (sampleId: string, currentTime: number) => void;
    onPositionsUpdate?: (positions: Record<string, number>) => void;
    onEnded?: () => void;
  },
): Promise<PlaybackHandle> {
  const {
    volume = 1,
    playbackRate = 1,
    globalTempoBpm = 120,
    overridePlayStart,
    sampleVolumes = {},
    onTimeUpdate,
    onPositionsUpdate,
    onEnded,
  } = options;
  const getEdits = useSampleEditsStore.getState().getEdits;
  const setCurrentTime = usePlayerStore.getState().setCurrentTime;
  const setPlaying = (v: boolean) => usePlayerStore.setState({ isPlaying: v });

  if (samples.length === 0) {
    onEnded?.();
    return {
      stop: () => {},
      stopSilent: () => {},
      getRestartPosition: () => null,
      scheduleSwitchAtNextBar: async () => {},
      setSampleVolume: () => {},
      setMasterVolume: () => {},
    };
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
    gainNode: GainNode;
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

    const decodableUrl = await ensureAudioDecodable(result.data, sample.path);
    const res = await fetch(decodableUrl);
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
    const sampleVolume = sampleVolumes[sample.id] ?? 1;
    const playDuration = loopEndExact - playStartExact;
    if (envelopePoints.length > 0) {
      const envInterval = 0.01;
      let lastGain = getGainAtTime(envelopePoints, playStartExact) * volume * sampleVolume;
      gainNode.gain.setValueAtTime(lastGain, 0);
      for (let bufT = envInterval; bufT < playDuration; bufT += envInterval) {
        const bufTime = playStartExact + bufT;
        const gain = getGainAtTime(envelopePoints, bufTime) * volume * sampleVolume;
        const outTime = bufT / rate;
        gainNode.gain.linearRampToValueAtTime(gain, outTime);
        lastGain = gain;
      }
      gainNode.gain.setValueAtTime(
        getGainAtTime(envelopePoints, loopEndExact) * volume * sampleVolume,
        playDuration / rate,
      );
    } else {
      gainNode.gain.value = volume * sampleVolume;
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
      gainNode,
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
      const elapsedInBuffer = elapsed * s.playbackRate;
      if (!s.loopEnabled) {
        const maxElapsed = s.playDuration / s.playbackRate;
        if (elapsed >= maxElapsed) continue;
      }
      const loopDuration = s.loopEnd - s.loopStart;
      const posInLoop = (((s.playStart - s.loopStart + elapsedInBuffer) % loopDuration) + loopDuration) % loopDuration;
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
        s.source.onended = null;
        s.source.stop();
      } catch {
        // ignore
      }
    }
    ctx.close();
  }

  async function scheduleSwitchAtNextBarImpl(newPath: string, newPaneType: PaneType): Promise<void> {
    if (stopped || mode !== "single" || sources.length === 0) return;
    const oldSource = sources[0];
    const now = ctx.currentTime;
    const startTime = startTimes.get(oldSource.sampleId) ?? now;
    const elapsed = now - startTime;
    const elapsedInBuffer = elapsed * oldSource.playbackRate;
    const loopDuration = oldSource.loopEnd - oldSource.loopStart;
    const posInLoop =
      (((oldSource.playStart - oldSource.loopStart + elapsedInBuffer) % loopDuration) + loopDuration) % loopDuration;
    const currentTimeSec = oldSource.loopStart + posInLoop;

    const beatsPerBar = 4;
    const secondsPerBar = (beatsPerBar * 60) / globalTempoBpm;
    const nextBarTime = Math.ceil(currentTimeSec / secondsPerBar) * secondsPerBar;
    const timeUntilNextBarSample = Math.max(0.001, nextBarTime - currentTimeSec);
    const timeUntilNextBarWall = timeUntilNextBarSample / oldSource.playbackRate;
    const switchAt = now + timeUntilNextBarWall;

    const result = await fileSystemService.getAudioFileBlob(newPath, newPaneType);
    if (!result.success || !result.data || stopped) return;

    const decodableUrl = await ensureAudioDecodable(result.data, newPath);
    const res = await fetch(decodableUrl);
    const arrayBuffer = await res.arrayBuffer();
    const buffer = await ctx.decodeAudioData(arrayBuffer);
    if (stopped) return;

    const bufferDuration = buffer.duration;
    const edits = getEdits(newPath);
    const region = edits?.region;
    const regionStart = region?.start ?? 0;
    const regionEnd = region?.end ?? bufferDuration;
    const loopStart = edits?.loopStart ?? regionStart;
    const loopEnd = edits?.loopEnd ?? regionEnd;
    const playStart = edits?.playStart ?? loopStart;
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
    const playDuration = loopEndExact - playStartExact;

    const rate = playbackRate;
    const newSourceNode = ctx.createBufferSource();
    newSourceNode.buffer = buffer;
    newSourceNode.playbackRate.value = rate;
    if (loopEnabled) {
      newSourceNode.loop = true;
      newSourceNode.loopStart = loopStartExact;
      newSourceNode.loopEnd = loopEndExact;
    }

    const gainNode = ctx.createGain();
    if (envelopePoints.length > 0) {
      let lastGain = getGainAtTime(envelopePoints, playStartExact) * volume;
      gainNode.gain.setValueAtTime(lastGain, switchAt);
      for (let bufT = 0.01; bufT < playDuration; bufT += 0.01) {
        const bufTime = playStartExact + bufT;
        const gain = getGainAtTime(envelopePoints, bufTime) * volume;
        gainNode.gain.linearRampToValueAtTime(gain, switchAt + bufT / rate);
        lastGain = gain;
      }
      gainNode.gain.setValueAtTime(
        getGainAtTime(envelopePoints, loopEndExact) * volume,
        switchAt + playDuration / rate,
      );
    } else {
      gainNode.gain.value = volume;
    }
    newSourceNode.connect(gainNode);
    gainNode.connect(masterGain);

    try {
      oldSource.source.stop(switchAt);
    } catch {
      // ignore if already stopped
    }
    newSourceNode.start(switchAt, playStartExact);

    const newSampleId = newPath;
    pathToSampleId.delete(oldSource.path);
    pathToSampleId.set(newPath, newSampleId);
    startTimes.delete(oldSource.sampleId);
    startTimes.set(newSampleId, switchAt);
    sources[0] = {
      source: newSourceNode,
      sampleId: newSampleId,
      path: newPath,
      loopStart: loopStartExact,
      loopEnd: loopEndExact,
      playStart: playStartExact,
      loopEnabled,
      envelopePoints,
      bufferDuration,
      playbackRate: rate,
      loopDuration: loopDurationExact,
      playDuration,
      gainNode,
    };
    usePlayerStore.setState({ singleFile: { path: newPath, paneType: newPaneType }, activeSampleId: newPath });
  }

  function setMasterVolumeImpl(newVolume: number): void {
    if (stopped) return;
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(clampedVolume, now + 0.01);
  }

  function setSampleVolumeImpl(sampleId: string, newVolume: number): void {
    if (stopped) return;
    const clampedVolume = Math.max(0, Math.min(1, newVolume));
    const s = sources.find((src) => src.sampleId === sampleId);
    if (!s) return;

    const now = ctx.currentTime;
    if (s.envelopePoints.length > 0) {
      // For envelope-based gain, we need to recalculate the gain curve
      // Get current position in the loop
      const startTime = startTimes.get(sampleId) ?? now;
      const elapsed = now - startTime;
      const elapsedInBuffer = elapsed * s.playbackRate;
      const loopDuration = s.loopEnd - s.loopStart;
      const posInLoop = (((s.playStart - s.loopStart + elapsedInBuffer) % loopDuration) + loopDuration) % loopDuration;
      const currentTimeSec = s.loopStart + posInLoop;

      // Get current envelope gain
      const envelopeGain = getGainAtTime(s.envelopePoints, currentTimeSec);
      const masterVol = masterGain.gain.value;
      const newGain = envelopeGain * masterVol * clampedVolume;

      // Update gain smoothly
      s.gainNode.gain.cancelScheduledValues(now);
      s.gainNode.gain.setValueAtTime(s.gainNode.gain.value, now);
      s.gainNode.gain.linearRampToValueAtTime(newGain, now + 0.01);

      // Reschedule envelope for the rest of the loop
      const playDuration = s.loopEnd - s.playStart;
      const remainingTime = playDuration - posInLoop;
      const envInterval = 0.01;
      for (let bufT = envInterval; bufT < remainingTime; bufT += envInterval) {
        const bufTime = currentTimeSec + bufT;
        const envelopeGainAtTime = getGainAtTime(s.envelopePoints, bufTime);
        const gain = envelopeGainAtTime * masterVol * clampedVolume;
        const outTime = now + bufT / s.playbackRate;
        s.gainNode.gain.linearRampToValueAtTime(gain, outTime);
      }
    } else {
      // Simple volume update
      const masterVol = masterGain.gain.value;
      const newGain = masterVol * clampedVolume;
      s.gainNode.gain.cancelScheduledValues(now);
      s.gainNode.gain.setValueAtTime(s.gainNode.gain.value, now);
      s.gainNode.gain.linearRampToValueAtTime(newGain, now + 0.01);
    }
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
      const posInOldLoop =
        (((s.playStart - s.loopStart + elapsedInBuffer) % oldLoopDuration) + oldLoopDuration) % oldLoopDuration;
      const newLoopDuration = Math.max(0.001, newLoopEnd - newLoopStart);
      const posInNewLoop = posInOldLoop % newLoopDuration;
      const newPos = newLoopStart + posInNewLoop;
      return newPos;
    },
    scheduleSwitchAtNextBar: scheduleSwitchAtNextBarImpl,
    setSampleVolume: setSampleVolumeImpl,
    setMasterVolume: setMasterVolumeImpl,
  };
}
