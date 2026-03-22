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

/** When set, slice grid is built over `[start, end]` (seconds) with absolute marker times. */
export interface SliceDetectionRegion {
  start: number;
  end: number;
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

/** Log-domain step cap so silence→sound does not dominate every other onset. */
const TRANSIENT_LOG_ONSET_CAP = 5.5;
/** Weight for log-relative step; remainder is absolute RMS rise / peak RMS (pre-noise friendly). */
const TRANSIENT_LOG_BLEND = 0.28;
/** Normalize scores by this percentile of raw scores so 1–2 intro spikes do not crush the rest. */
const TRANSIENT_NORM_PERCENTILE = 0.92;
/** Floor for scale = max(percentile, maxRaw * this) to avoid exploding when the file is mostly flat. */
const TRANSIENT_MIN_SCALE_FRAC = 0.045;
const TRANSIENT_LOG_EPS = 1e-14;

/**
 * Simple envelope-based transient detection.
 * Returns onset strength (0-1) for each frame.
 * Combines log-compressed relative step (bounded vs silence-before) with absolute RMS rise vs file peak,
 * then normalizes by a high percentile so a few "infinite ratio" frames do not flatten everything else.
 */
export function computeTransientScores(
  samples: Float32Array,
  sampleRate: number,
): { time: number; score: number }[] {
  const positions: number[] = [];
  const rmsValues: number[] = [];
  for (let pos = 0; pos + FRAME_SIZE <= samples.length; pos += HOP_SIZE) {
    positions.push(pos);
    rmsValues.push(rms(samples, pos, FRAME_SIZE));
  }
  if (rmsValues.length === 0) return [];

  const globalMaxRms = Math.max(...rmsValues, 1e-20);
  const absBlend = 1 - TRANSIENT_LOG_BLEND;

  const prevRms: number[] = [];
  const rawScores: number[] = [];

  for (let i = 0; i < rmsValues.length; i++) {
    const currentRms = rmsValues[i];
    const prev = prevRms.length >= 2 ? prevRms[prevRms.length - 2] : currentRms;
    prevRms.push(currentRms);
    if (prevRms.length > 4) prevRms.shift();

    const logOnset = Math.max(
      0,
      Math.log(currentRms + TRANSIENT_LOG_EPS) -
        Math.log(prev + TRANSIENT_LOG_EPS),
    );
    const logNorm = Math.min(1, logOnset / TRANSIENT_LOG_ONSET_CAP);

    const delta = Math.max(0, currentRms - prev);
    const absNorm = delta / globalMaxRms;

    const raw = TRANSIENT_LOG_BLEND * logNorm + absBlend * absNorm;
    rawScores.push(raw);
  }

  let maxRaw = 0;
  for (const r of rawScores) maxRaw = Math.max(maxRaw, r);

  const sorted = [...rawScores].sort((a, b) => a - b);
  const pctIdx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor(TRANSIENT_NORM_PERCENTILE * (sorted.length - 1))),
  );
  const pPct = sorted[pctIdx] ?? 0;
  const scale = Math.max(pPct, maxRaw * TRANSIENT_MIN_SCALE_FRAC, 1e-15);

  const results: { time: number; score: number }[] = [];
  for (let i = 0; i < rmsValues.length; i++) {
    const time = positions[i] / sampleRate;
    const score = Math.min(1, rawScores[i] / scale);
    results.push({ time, score });
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
export function computePitchChangeScores(
  samples: Float32Array,
  sampleRate: number,
): { time: number; score: number }[] {
  const results: { time: number; score: number }[] = [];
  let prevPitch = 0;

  for (
    let pos = 0;
    pos + PITCH_WINDOW_SIZE <= samples.length;
    pos += HOP_SIZE
  ) {
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
export function scoreAtTime(
  frames: { time: number; score: number }[],
  time: number,
): number {
  if (frames.length === 0) return 0;
  if (time <= frames[0].time) return frames[0].score;
  if (time >= frames[frames.length - 1].time)
    return frames[frames.length - 1].score;

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
export interface SliceDetectionTiming {
  beatsPerBar: number;
  beatUnit: number;
}

export function detectSliceMarkers(
  buffer: AudioBuffer,
  duration: number,
  bpm: number,
  mode: SliceDetectionMode = "transient",
  region?: SliceDetectionRegion,
  timing?: SliceDetectionTiming,
): SliceMarker[] {
  const fullDuration = buffer.duration;
  const t0 = region ? Math.max(0, region.start) : 0;
  const t1 = region
    ? Math.min(fullDuration, region.end)
    : Math.min(fullDuration, duration);
  const gridSpan = Math.max(0.001, t1 - t0);

  const beatsPerBar = timing?.beatsPerBar ?? 4;
  const beatUnit = timing?.beatUnit ?? 4;
  const barSeconds = beatsPerBar * (60 / Math.max(1, bpm)) * (4 / beatUnit);
  const bars = gridSpan / barSeconds;
  const numGridPoints = Math.max(1, Math.floor(32 * bars));
  const gridInterval = gridSpan / numGridPoints;
  const searchRadius = gridInterval / 2;

  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;

  const transientFrames = computeTransientScores(channel, sampleRate);
  const pitchFrames = computePitchChangeScores(channel, sampleRate);

  const markers: SliceMarker[] = [];
  const numSearchSteps = Math.max(
    5,
    Math.floor((searchRadius * 2 * sampleRate) / HOP_SIZE),
  );

  for (let g = 0; g < numGridPoints; g++) {
    const gridTime = t0 + (g + 0.5) * gridInterval;
    let bestTime = gridTime;
    let bestConfidence = 0;

    for (let s = 0; s < numSearchSteps; s++) {
      const t =
        gridTime -
        searchRadius +
        (searchRadius * 2 * s) / Math.max(1, numSearchSteps - 1);
      const clampedT = Math.max(t0, Math.min(t1, t));
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
  const startSample = Math.min(
    channel.length - 1,
    Math.max(0, Math.floor(t0 * sampleRate)),
  );
  const startWindowSamples = Math.min(
    Math.floor((startWindowMs / 1000) * sampleRate),
    channel.length - startSample,
  );
  const startRms =
    startWindowSamples > 0 ? rms(channel, startSample, startWindowSamples) : 0;
  const numFrames = Math.min(500, Math.ceil(channel.length / HOP_SIZE));
  const maxRms = Math.max(
    ...Array.from({ length: numFrames }, (_, i) =>
      rms(channel, i * HOP_SIZE, FRAME_SIZE),
    ),
    1e-10,
  );
  const hasAudioAtStart = startRms > maxRms * 0.03;
  const nearestToStart = markers.reduce(
    (best, m) => (m.time < best.time ? m : best),
    markers[0] ?? { time: Infinity, confidence: 0 },
  );
  const minSpacingSec = MIN_SPACING_MS / 1000;
  const startAlreadyCovered =
    nearestToStart && nearestToStart.time - t0 < minSpacingSec;
  if (hasAudioAtStart && !startAlreadyCovered) {
    const startConfidence = Math.min(1, 0.5 + (startRms / maxRms) * 0.5);
    markers.push({ time: t0, confidence: startConfidence });
    markers.sort((a, b) => a.time - b.time);
  }

  return markers;
}

const ELBOW_MIN_GAP = 0.04;

/**
 * Pick slice count from the largest drop in sorted confidences (elbow).
 * Falls back to a median split when gaps are flat.
 */
export function inferSliceCountFromConfidences(markers: SliceMarker[]): {
  numSlices: number;
  threshold: number;
  method: "confidence_elbow" | "median_fallback" | "single" | "empty";
} {
  if (markers.length === 0) {
    return { numSlices: 1, threshold: 0, method: "empty" };
  }
  const c = [...markers].map((m) => m.confidence).sort((a, b) => b - a);
  if (c.length === 1) {
    return { numSlices: 1, threshold: c[0], method: "single" };
  }

  let bestI = 0;
  let bestGap = -1;
  for (let i = 0; i < c.length - 1; i++) {
    const gap = c[i] - c[i + 1];
    if (gap > bestGap) {
      bestGap = gap;
      bestI = i;
    }
  }

  if (bestGap < ELBOW_MIN_GAP) {
    const mid = c[Math.floor(c.length / 2)];
    const numAbove = c.filter((x) => x >= mid).length;
    return {
      numSlices: Math.max(1, numAbove),
      threshold: mid,
      method: "median_fallback",
    };
  }

  const numSlices = bestI + 1;
  return {
    numSlices: Math.max(1, Math.min(numSlices, markers.length)),
    threshold: c[numSlices - 1],
    method: "confidence_elbow",
  };
}

/**
 * Keep every marker with confidence >= threshold (no spacing filter).
 */
export function selectSlicesByConfidenceThreshold(
  markers: SliceMarker[],
  threshold: number,
): SliceMarker[] {
  if (markers.length === 0) return [];
  return [...markers]
    .filter((m) => m.confidence >= threshold)
    .sort((a, b) => a.time - b.time);
}

/**
 * Top N by confidence (desc), tie-break earlier time; `selected` is time-ordered.
 * `weakestKept` / `nextCandidateConfidence` support the slicing UI (floor vs next inclusion).
 */
/** Confidence text for the slice chip (extra decimals when values are small). */
export function formatSliceConfidenceChip(t: number): string {
  if (!Number.isFinite(t)) return "—";
  const a = Math.abs(t);
  if (a === 0) return "0.0000";
  if (a < 0.01) return t.toFixed(4);
  if (a < 0.1) return t.toFixed(3);
  return t.toFixed(2);
}

export function selectTopNSlicesWithMeta(
  markers: SliceMarker[],
  n: number,
): {
  selected: SliceMarker[];
  weakestKept: number;
  nextCandidateConfidence: number | null;
} {
  if (markers.length === 0 || n <= 0) {
    return { selected: [], weakestKept: 0, nextCandidateConfidence: null };
  }
  const capped = Math.min(Math.max(1, Math.floor(n)), markers.length);
  const sorted = [...markers].sort((a, b) => {
    const d = b.confidence - a.confidence;
    if (d !== 0) return d;
    return a.time - b.time;
  });
  const picked = sorted.slice(0, capped);
  const weakestKept = Math.min(...picked.map((m) => m.confidence));
  const nextCandidateConfidence =
    capped < sorted.length ? sorted[capped].confidence : null;
  return {
    selected: picked.sort((a, b) => a.time - b.time),
    weakestKept,
    nextCandidateConfidence,
  };
}

/**
 * Confidence of the Nth-highest marker (1-based). Dragging “slice count” to N sets cutoff to this value so at least N markers pass (ties can yield more).
 */
export function confidenceThresholdForMinCount(
  markers: SliceMarker[],
  count: number,
): number {
  if (markers.length === 0) return 1;
  const n = Math.max(1, Math.min(count, markers.length));
  const sorted = [...markers].map((m) => m.confidence).sort((a, b) => b - a);
  return sorted[n - 1] ?? 0;
}

/**
 * @deprecated Prefer {@link selectSlicesByConfidenceThreshold} with an elbow-derived threshold.
 */
export function selectTopSlices(
  markers: SliceMarker[],
  numSlices: number,
  _minSpacingMs: number = MIN_SPACING_MS,
): SliceMarker[] {
  return selectTopNSlicesWithMeta(markers, numSlices).selected;
}
