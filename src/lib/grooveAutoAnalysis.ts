/**
 * Wand-button groove analysis: audio BPM, beat-aligned loop start, multi-bar length,
 * quarter grid, and slice markers over the loop region.
 */

import {
  computePitchChangeScores,
  computeTransientScores,
  detectSliceMarkers,
  inferSliceCountFromConfidences,
  type SliceDetectionMode,
  type SliceMarker,
  scoreAtTime,
} from "@/lib/sliceDetection";

const BPM_MIN = 50;
const BPM_MAX = 240;
const FRAME_SIZE = 512;
const HOP_SIZE = 256;
const ENVELOPE_HOP = 1024;

const FIRST_TRANSIENT_THRESHOLD = 0.15;
/** Softer threshold in the first ~0.5s so a quiet kick before a loud backbeat is not skipped */
const INTRO_ONSET_THRESHOLDS = [0.08, 0.11, 0.14] as const;
const INTRO_ONSET_MAX_SEC = 0.48;
const LEADING_SILENCE_WINDOW_MS = 80;
const START_HAS_AUDIO_THRESHOLD = 0.05;

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

function hasAudioAtStart(samples: Float32Array, sampleRate: number): boolean {
  const windowSamples = Math.min(
    Math.floor((LEADING_SILENCE_WINDOW_MS / 1000) * sampleRate),
    samples.length,
  );
  if (windowSamples <= 0) return true;
  const startRms = rms(samples, 0, windowSamples);

  const first2sSamples = Math.min(2 * sampleRate, samples.length);
  let maxRms = 0;
  for (let pos = 0; pos + FRAME_SIZE <= first2sSamples; pos += HOP_SIZE) {
    maxRms = Math.max(maxRms, rms(samples, pos, FRAME_SIZE));
  }
  if (maxRms < 1e-10) return true;
  return startRms > maxRms * START_HAS_AUDIO_THRESHOLD;
}

function detectFirstTransientTime(
  samples: Float32Array,
  sampleRate: number,
): number {
  const prevRms: number[] = [];
  let maxRawScore = 0;

  for (let pos = 0; pos + FRAME_SIZE <= samples.length; pos += HOP_SIZE) {
    const currentRms = rms(samples, pos, FRAME_SIZE);
    const prev = prevRms.length >= 2 ? prevRms[prevRms.length - 2] : currentRms;
    prevRms.push(currentRms);
    if (prevRms.length > 4) prevRms.shift();

    const onset = prev > 1e-8 ? Math.max(0, (currentRms - prev) / prev) : 0;
    const rawScore = onset * (currentRms + 1e-8);
    maxRawScore = Math.max(maxRawScore, rawScore);
  }

  if (maxRawScore <= 0) return 0;

  for (let pos = 0; pos + FRAME_SIZE <= samples.length; pos += HOP_SIZE) {
    const time = pos / sampleRate;
    const currentRms = rms(samples, pos, FRAME_SIZE);
    const prev =
      pos >= HOP_SIZE * 2
        ? rms(samples, pos - HOP_SIZE * 2, FRAME_SIZE)
        : currentRms;
    const onset = prev > 1e-8 ? Math.max(0, (currentRms - prev) / prev) : 0;
    const rawScore = onset * (currentRms + 1e-8);
    const normalizedScore = rawScore / maxRawScore;
    if (normalizedScore >= FIRST_TRANSIENT_THRESHOLD) {
      return time;
    }
  }
  return 0;
}

/**
 * Earliest meaningful hit (kick after silence): prefers the first crossing in the intro
 * with a lower threshold so a strong backbeat later does not steal the anchor.
 */
function detectEarliestHitTime(
  samples: Float32Array,
  sampleRate: number,
): number {
  const prevRms: number[] = [];
  let maxRawScore = 0;

  for (let pos = 0; pos + FRAME_SIZE <= samples.length; pos += HOP_SIZE) {
    const currentRms = rms(samples, pos, FRAME_SIZE);
    const prev = prevRms.length >= 2 ? prevRms[prevRms.length - 2] : currentRms;
    prevRms.push(currentRms);
    if (prevRms.length > 4) prevRms.shift();

    const onset = prev > 1e-8 ? Math.max(0, (currentRms - prev) / prev) : 0;
    const rawScore = onset * (currentRms + 1e-8);
    maxRawScore = Math.max(maxRawScore, rawScore);
  }

  if (maxRawScore <= 0) return 0;

  const introEndSample = Math.min(
    samples.length,
    Math.floor(INTRO_ONSET_MAX_SEC * sampleRate),
  );

  for (const thresh of INTRO_ONSET_THRESHOLDS) {
    prevRms.length = 0;
    for (let pos = 0; pos + FRAME_SIZE <= samples.length; pos += HOP_SIZE) {
      const time = pos / sampleRate;
      if (pos + FRAME_SIZE > introEndSample) break;

      const currentRms = rms(samples, pos, FRAME_SIZE);
      const prev =
        prevRms.length >= 2 ? prevRms[prevRms.length - 2] : currentRms;
      prevRms.push(currentRms);
      if (prevRms.length > 4) prevRms.shift();

      const onset = prev > 1e-8 ? Math.max(0, (currentRms - prev) / prev) : 0;
      const rawScore = onset * (currentRms + 1e-8);
      const normalizedScore = rawScore / maxRawScore;
      if (normalizedScore >= thresh) {
        return time;
      }
    }
  }

  return detectFirstTransientTime(samples, sampleRate);
}

function buildOnsetEnvelope(samples: Float32Array): Float32Array {
  const envelopeLen = Math.floor(samples.length / ENVELOPE_HOP);
  const envelope = new Float32Array(envelopeLen);
  let prevRms = 0;

  for (let i = 0; i < envelopeLen; i++) {
    const pos = i * ENVELOPE_HOP;
    const currentRms = rms(
      samples,
      pos,
      Math.min(FRAME_SIZE, samples.length - pos),
    );
    const onset =
      prevRms > 1e-8 ? Math.max(0, (currentRms - prevRms) / prevRms) : 0;
    envelope[i] = onset * (currentRms + 1e-8);
    prevRms = currentRms;
  }

  let maxVal = 0;
  for (let i = 0; i < envelope.length; i++)
    maxVal = Math.max(maxVal, envelope[i]);
  if (maxVal > 0) {
    for (let i = 0; i < envelope.length; i++) envelope[i] /= maxVal;
  }
  return envelope;
}

/** Normalized correlation at lag (frames). */
function corrAtLag(envelope: Float32Array, lag: number): number {
  let sum = 0;
  let norm = 0;
  const n = envelope.length - lag;
  if (n <= 0) return 0;
  for (let i = 0; i < n; i++) {
    sum += envelope[i] * envelope[i + lag];
    norm += envelope[i] * envelope[i];
  }
  return norm > 1e-12 ? sum / Math.sqrt(norm) : 0;
}

/** Best BPM (float) and correlation from onset envelope autocorrelation. */
function detectBpmFloatFromEnvelope(
  envelope: Float32Array,
  envelopeRate: number,
): { bpm: number; corr: number } | null {
  const minLagFrames = Math.floor(envelopeRate / (BPM_MAX / 60));
  const maxLagFrames = Math.min(
    Math.floor(envelope.length / 2),
    Math.ceil(envelopeRate / (BPM_MIN / 60)),
  );

  if (minLagFrames >= maxLagFrames) return null;

  let bestBpm = 0;
  let bestCorr = -1;

  for (let lag = minLagFrames; lag <= maxLagFrames; lag++) {
    const corr = corrAtLag(envelope, lag);
    if (corr > bestCorr) {
      bestCorr = corr;
      const lagSeconds = lag / envelopeRate;
      bestBpm = 60 / lagSeconds;
    }
  }

  if (bestBpm < BPM_MIN || bestBpm > BPM_MAX) return null;
  return { bpm: bestBpm, corr: bestCorr };
}

/**
 * Local-maxima lag peaks → BPM candidates (handles 80 vs 120 style aliasing).
 */
function bpmPeaksFromEnvelope(
  envelope: Float32Array,
  envelopeRate: number,
  maxPeaks: number,
): Array<{ bpm: number; corr: number }> {
  const minLagFrames = Math.floor(envelopeRate / (BPM_MAX / 60));
  const maxLagFrames = Math.min(
    Math.floor(envelope.length / 2),
    Math.ceil(envelopeRate / (BPM_MIN / 60)),
  );
  if (minLagFrames >= maxLagFrames) return [];

  const corrs: number[] = [];
  for (let lag = minLagFrames; lag <= maxLagFrames; lag++) {
    corrs.push(corrAtLag(envelope, lag));
  }

  const peaks: Array<{ lag: number; corr: number }> = [];
  for (let i = 1; i < corrs.length - 1; i++) {
    if (corrs[i] >= corrs[i - 1] && corrs[i] >= corrs[i + 1]) {
      peaks.push({ lag: minLagFrames + i, corr: corrs[i] });
    }
  }
  peaks.sort((a, b) => b.corr - a.corr);

  const out: Array<{ bpm: number; corr: number }> = [];
  for (const p of peaks) {
    const bpm = 60 / (p.lag / envelopeRate);
    if (bpm >= BPM_MIN && bpm <= BPM_MAX) {
      out.push({ bpm, corr: p.corr });
    }
    if (out.length >= maxPeaks) break;
  }
  return out;
}

function clampBpm(n: number): number | null {
  const r = Math.round(n);
  if (r < BPM_MIN || r > BPM_MAX) return null;
  return r;
}

function uniqueBmps(values: number[]): number[] {
  const out: number[] = [];
  const seen = new Set<number>();
  for (const v of values) {
    const c = clampBpm(v);
    if (c != null && !seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }
  return out;
}

function bpmCandidatesFromAudio(buffer: AudioBuffer): number[] {
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const envelope = buildOnsetEnvelope(channel);
  const envelopeRate = sampleRate / ENVELOPE_HOP;
  const det = detectBpmFloatFromEnvelope(envelope, envelopeRate);
  if (!det) return [120];

  const fromPeaks = bpmPeaksFromEnvelope(envelope, envelopeRate, 8);
  const b = det.bpm;
  const pool: number[] = [
    b,
    Math.round(b),
    b / 2,
    b * 2,
    (b * 2) / 3,
    (b * 3) / 2,
    (b * 4) / 3,
    (b * 3) / 4,
  ];
  for (const p of fromPeaks) {
    pool.push(p.bpm, p.bpm / 2, p.bpm * 2, Math.round(p.bpm));
  }
  return uniqueBmps(pool);
}

/** Prefer common dance/loop tempos when phase scores tie (fixes half-time / wrong peak). */
function bpmTieBreakBonus(bpm: number): number {
  if (bpm >= 100 && bpm <= 138) return 0.035;
  if (bpm >= 90 && bpm <= 150) return 0.02;
  if (bpm >= 80 && bpm <= 160) return 0.01;
  return 0;
}

/** Largest power of two ≤ n (n ≥ 1). */
function largestPow2AtMost(n: number): number {
  const k = Math.max(1, Math.floor(n));
  let p = 1;
  while (p * 2 <= k) p *= 2;
  return p;
}

function quarterGridPhaseScore(
  secondsPerBeat: number,
  phi: number,
  scoreFromTime: number,
  duration: number,
  transientFrames: { time: number; score: number }[],
  pitchFrames: { time: number; score: number }[],
): number {
  const step = secondsPerBeat / 4;
  if (step <= 0) return 0;
  let sum = 0;
  let count = 0;
  const maxSteps = 512;
  const tAlign = phi + Math.ceil((scoreFromTime - phi) / step - 1e-9) * step;
  for (let t = tAlign; t < duration && count < maxSteps; t += step) {
    sum +=
      0.72 * scoreAtTime(transientFrames, t) +
      0.28 * scoreAtTime(pitchFrames, t);
    count++;
  }
  return count > 0 ? sum / count : 0;
}

function bestPhaseForBpm(
  bpm: number,
  beatUnit: number,
  phaseScoreFrom: number,
  duration: number,
  transientFrames: { time: number; score: number }[],
  pitchFrames: { time: number; score: number }[],
): { score: number; phi: number } {
  const secondsPerBeat = (60 / bpm) * (4 / beatUnit);
  const steps = Math.max(16, Math.min(96, Math.ceil(secondsPerBeat / 0.003)));
  let bestScore = -1;
  let bestPhi = 0;
  for (let s = 0; s < steps; s++) {
    const phi = (s / steps) * secondsPerBeat;
    const sc =
      quarterGridPhaseScore(
        secondsPerBeat,
        phi,
        phaseScoreFrom,
        duration,
        transientFrames,
        pitchFrames,
      ) + bpmTieBreakBonus(bpm);
    if (sc > bestScore) {
      bestScore = sc;
      bestPhi = phi;
    }
  }
  return { score: bestScore, phi: bestPhi };
}

export interface GrooveAutoOptions {
  beatsPerBar?: number;
  /** Denominator of time signature (e.g. 4 for 4/4). Matches AudioPreview tempo math. */
  beatUnit?: number;
  sliceMode?: SliceDetectionMode;
}

export interface GrooveAutoResult {
  bpm: number;
  loopStart: number;
  loopEnd: number;
  barsInLoop: number;
  /** Wand path always uses audio-derived BPM */
  bpmFromFilename: false;
  trimmedSilence: boolean;
  /** Quarter times in [loopStart, loopEnd) */
  quarterTimes: number[];
  sliceMarkers: SliceMarker[];
  numSlices: number;
  sliceConfidenceThreshold: number;
  sliceCountMethod: "confidence_elbow" | "median_fallback" | "single" | "empty";
}

/**
 * Full groove + slice analysis for the magic wand (audio BPM only).
 */
export function analyzeGrooveAuto(
  buffer: AudioBuffer,
  options: GrooveAutoOptions = {},
): GrooveAutoResult {
  const beatsPerBar = options.beatsPerBar ?? 4;
  const beatUnit = options.beatUnit ?? 4;
  const sliceMode: SliceDetectionMode = options.sliceMode ?? "transient";

  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;

  const startsWithAudio = hasAudioAtStart(channel, sampleRate);
  /** Earliest hit (kick): intro-sensitive so a loud backbeat does not steal the anchor. */
  const anchorOnset = detectEarliestHitTime(channel, sampleRate);

  const transientFrames = computeTransientScores(channel, sampleRate);
  const pitchFrames = computePitchChangeScores(channel, sampleRate);

  const candidates = bpmCandidatesFromAudio(buffer);

  let bestBpm = candidates[0] ?? 120;
  let bestScore = -1;

  const phaseScoreFrom = Math.max(0, anchorOnset - 0.02);

  for (const bpm of candidates) {
    const { score } = bestPhaseForBpm(
      bpm,
      beatUnit,
      phaseScoreFrom,
      duration,
      transientFrames,
      pitchFrames,
    );
    if (score > bestScore) {
      bestScore = score;
      bestBpm = bpm;
    }
  }

  // Half-time fix: backbeat-heavy loops often lock at ½ BPM; prefer 2× when phase still fits.
  const doubled = clampBpm(bestBpm * 2);
  if (doubled != null && bestBpm < 102) {
    const { score } = bestPhaseForBpm(
      doubled,
      beatUnit,
      phaseScoreFrom,
      duration,
      transientFrames,
      pitchFrames,
    );
    const needRatio = bestBpm <= 75 ? 0.78 : 0.86;
    if (score >= bestScore * needRatio) {
      bestBpm = doubled;
      bestScore = score;
    }
  }

  const secondsPerBeat = (60 / bestBpm) * (4 / beatUnit);
  const secondsPerBar = secondsPerBeat * beatsPerBar;

  const loopStart = Math.max(0, Math.min(duration, anchorOnset));

  const usableAfterStart = Math.max(0, duration - loopStart);
  const wholeBarsThatFit = Math.floor(usableAfterStart / secondsPerBar + 1e-9);
  let bestBars: number;
  if (wholeBarsThatFit < 1) {
    bestBars = 1;
  } else {
    bestBars = largestPow2AtMost(wholeBarsThatFit);
  }

  const loopEnd = Math.min(duration, loopStart + bestBars * secondsPerBar);

  /** Beat = quarter in 4/4; matches editor grid. */
  const quarterTimes: number[] = [];
  for (let t = loopStart; t < loopEnd - 1e-9; t += secondsPerBeat) {
    quarterTimes.push(t);
  }

  // Slice grid spans the entire sample; loop bounds only affect playback/export region.
  const sliceMarkers = detectSliceMarkers(
    buffer,
    duration,
    bestBpm,
    sliceMode,
    undefined,
    { beatsPerBar, beatUnit },
  );

  const inferred = inferSliceCountFromConfidences(sliceMarkers);

  return {
    bpm: bestBpm,
    loopStart,
    loopEnd,
    barsInLoop: bestBars,
    bpmFromFilename: false,
    trimmedSilence: !startsWithAudio && anchorOnset > 0.01,
    quarterTimes,
    sliceMarkers,
    numSlices: inferred.numSlices,
    sliceConfidenceThreshold: inferred.threshold,
    sliceCountMethod: inferred.method,
  };
}
