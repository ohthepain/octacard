/**
 * Transient and pitch-change slice detection for waveform editor.
 * Precomputes candidate slice positions at 32nd-note grid points,
 * scoring each by transient, pitch-change, or combined confidence.
 */

export type SliceDetectionMode = "transient" | "pitch" | "both";

export interface SliceMarker {
  time: number;
  confidence: number;
}

const FRAME_SIZE = 512;
const PITCH_WINDOW_SIZE = 2048;
const HOP_SIZE = 256;
const MIN_SPACING_MS = 20;

/**
 * Compute RMS (root mean square) of a sample buffer.
 */
function rms(samples: Float32Array, start: number, length: number): number {
  let sum = 0;
  const end = Math.min(start + length, samples.length);
  const count = end - start;
  if (count <= 0) return 0;
  for (let i = start; i < end; i++) {
    const s = samples[i];
    sum += s * s;
  }
  return Math.sqrt(sum / count);
}

/**
 * Simple envelope-based transient detection.
 * Returns onset strength (0-1) for each frame.
 * Weighted by absolute RMS so loud transients rank higher than quiet noise spikes.
 */
function computeTransientScores(
  samples: Float32Array,
  sampleRate: number
): { time: number; score: number }[] {
  const results: { time: number; score: number }[] = [];
  const prevRms: number[] = [];
  let maxRawScore = 0;

  for (let pos = 0; pos + FRAME_SIZE <= samples.length; pos += HOP_SIZE) {
    const time = pos / sampleRate;
    const currentRms = rms(samples, pos, FRAME_SIZE);
    const prev = prevRms.length >= 2 ? prevRms[prevRms.length - 2] : currentRms;
    prevRms.push(currentRms);
    if (prevRms.length > 4) prevRms.shift();

    const onset = prev > 1e-8 ? Math.max(0, (currentRms - prev) / prev) : 0;
    const rawScore = onset * (currentRms + 1e-8);
    maxRawScore = Math.max(maxRawScore, rawScore);
    results.push({ time, score: rawScore });
  }

  if (maxRawScore > 0) {
    for (const r of results) {
      r.score = Math.min(1, r.score / maxRawScore);
    }
  }
  return results;
}

/**
 * Autocorrelation-based pitch estimation.
 * Returns fundamental frequency in Hz or 0 if unclear.
 */
function estimatePitch(samples: Float32Array, sampleRate: number): number {
  const n = Math.min(samples.length, PITCH_WINDOW_SIZE);
  const minLag = Math.floor(sampleRate / 500);
  const maxLag = Math.floor(sampleRate / 50);

  let bestLag = 0;
  let bestCorr = -1;

  for (let lag = minLag; lag <= maxLag && lag < n - 1; lag++) {
    let corr = 0;
    for (let i = 0; i < n - lag; i++) {
      corr += samples[i] * samples[i + lag];
    }
    if (corr > bestCorr) {
      bestCorr = corr;
      bestLag = lag;
    }
  }

  if (bestLag <= 0 || bestCorr < 0) return 0;
  return sampleRate / bestLag;
}

/**
 * Compute pitch change strength between consecutive windows.
 */
function computePitchChangeScores(
  samples: Float32Array,
  sampleRate: number
): { time: number; score: number }[] {
  const results: { time: number; score: number }[] = [];
  let prevPitch = 0;

  for (let pos = 0; pos + PITCH_WINDOW_SIZE <= samples.length; pos += HOP_SIZE) {
    const time = pos / sampleRate;
    const window = samples.subarray(pos, pos + PITCH_WINDOW_SIZE);
    const pitch = estimatePitch(window, sampleRate);

    let score = 0;
    if (prevPitch > 20 && pitch > 20) {
      const ratio = Math.max(pitch / prevPitch, prevPitch / pitch);
      score = Math.min(1, (ratio - 1) * 3);
    }
    prevPitch = pitch;
    results.push({ time, score });
  }

  let maxScore = 0;
  for (const r of results) maxScore = Math.max(maxScore, r.score);
  if (maxScore > 0) {
    for (const r of results) r.score = r.score / maxScore;
  }
  return results;
}

/**
 * Interpolate score at a given time from discrete frame scores.
 */
function scoreAtTime(
  frames: { time: number; score: number }[],
  time: number
): number {
  if (frames.length === 0) return 0;
  if (time <= frames[0].time) return frames[0].score;
  if (time >= frames[frames.length - 1].time) return frames[frames.length - 1].score;

  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (time >= a.time && time <= b.time) {
      const t = (time - a.time) / (b.time - a.time);
      return a.score + t * (b.score - a.score);
    }
  }
  return 0;
}

/**
 * Detect slice markers at 32nd-note grid points.
 * For each grid point, finds the best match (transient, pitch change, or both) within the search window
 * and assigns a confidence score.
 */
export function detectSliceMarkers(
  buffer: AudioBuffer,
  duration: number,
  bpm: number,
  mode: SliceDetectionMode = "transient"
): SliceMarker[] {
  const bars = (duration * bpm) / 240;
  const numGridPoints = Math.max(1, Math.floor(32 * bars));
  const gridInterval = duration / numGridPoints;
  const searchRadius = gridInterval / 2;

  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  const transientFrames = computeTransientScores(channel, sampleRate);
  const pitchFrames = computePitchChangeScores(channel, sampleRate);

  const markers: SliceMarker[] = [];
  const numSearchSteps = Math.max(5, Math.floor((searchRadius * 2 * sampleRate) / HOP_SIZE));

  for (let g = 0; g < numGridPoints; g++) {
    const gridTime = (g + 0.5) * gridInterval;
    let bestTime = gridTime;
    let bestConfidence = 0;

    for (let s = 0; s < numSearchSteps; s++) {
      const t =
        gridTime - searchRadius + (searchRadius * 2 * s) / Math.max(1, numSearchSteps - 1);
      const clampedT = Math.max(0, Math.min(duration, t));
      const transientScore = scoreAtTime(transientFrames, clampedT);
      const pitchScore = scoreAtTime(pitchFrames, clampedT);
      const confidence =
        mode === "transient"
          ? transientScore
          : mode === "pitch"
            ? pitchScore
            : 0.6 * transientScore + 0.4 * pitchScore;
      if (confidence > bestConfidence) {
        bestConfidence = confidence;
        bestTime = clampedT;
      }
    }

    markers.push({ time: bestTime, confidence: Math.min(1, bestConfidence) });
  }

  // Ensure a slice at the start when there is audio there (first slice would otherwise be missed)
  const startWindowMs = 50;
  const startWindowSamples = Math.min(
    Math.floor((startWindowMs / 1000) * sampleRate),
    channel.length
  );
  const startRms = rms(channel, 0, startWindowSamples);
  const numFrames = Math.min(500, Math.ceil(channel.length / HOP_SIZE));
  const maxRms = Math.max(
    ...Array.from({ length: numFrames }, (_, i) =>
      rms(channel, i * HOP_SIZE, FRAME_SIZE)
    ),
    1e-10
  );
  const hasAudioAtStart = startRms > maxRms * 0.03;
  const nearestToStart = markers.reduce(
    (best, m) => (m.time < best.time ? m : best),
    markers[0] ?? { time: Infinity, confidence: 0 }
  );
  const minSpacingSec = MIN_SPACING_MS / 1000;
  const startAlreadyCovered = nearestToStart && nearestToStart.time < minSpacingSec;
  if (hasAudioAtStart && !startAlreadyCovered) {
    const startConfidence = Math.min(1, 0.5 + (startRms / maxRms) * 0.5);
    markers.push({ time: 0, confidence: startConfidence });
    markers.sort((a, b) => a.time - b.time);
  }

  return markers;
}

/**
 * Select top N slice markers by confidence, with optional minimum spacing.
 */
export function selectTopSlices(
  markers: SliceMarker[],
  numSlices: number,
  minSpacingMs: number = MIN_SPACING_MS
): SliceMarker[] {
  if (markers.length === 0 || numSlices <= 0) return [];
  const sorted = [...markers].sort((a, b) => b.confidence - a.confidence);
  const selected: SliceMarker[] = [];
  const minSpacingSec = minSpacingMs / 1000;

  for (const m of sorted) {
    if (selected.length >= numSlices) break;
    const tooClose = selected.some((s) => Math.abs(s.time - m.time) < minSpacingSec);
    if (!tooClose) {
      selected.push(m);
    }
  }

  return selected.sort((a, b) => a.time - b.time);
}
