/**
 * Auto-detect BPM, trim leading silence, and set loop bounds for waveform editor.
 * Used by the magic-wand Auto button.
 */

import { parseBpmFromString } from "@/lib/tempoUtils";

const BPM_MIN = 50;
const BPM_MAX = 240;
const FRAME_SIZE = 512;
const HOP_SIZE = 256;
/** Envelope downsampling: one frame per N input samples for autocorrelation */
const ENVELOPE_HOP = 1024;

/** Minimum transient score (0-1) to consider as first onset; below = silence */
const FIRST_TRANSIENT_THRESHOLD = 0.15;

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
 * Find the time (seconds) of the first significant transient.
 * Returns 0 if audio starts with content (no leading silence), or the time of the first onset.
 */
function detectFirstTransientTime(samples: Float32Array, sampleRate: number): number {
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
    const prev = pos >= HOP_SIZE * 2 ? rms(samples, pos - HOP_SIZE * 2, FRAME_SIZE) : currentRms;
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
 * Build onset strength envelope (downsampled for autocorrelation).
 */
function buildOnsetEnvelope(samples: Float32Array, sampleRate: number): Float32Array {
  const envelopeLen = Math.floor(samples.length / ENVELOPE_HOP);
  const envelope = new Float32Array(envelopeLen);
  let prevRms = 0;

  for (let i = 0; i < envelopeLen; i++) {
    const pos = i * ENVELOPE_HOP;
    const currentRms = rms(samples, pos, Math.min(FRAME_SIZE, samples.length - pos));
    const onset = prevRms > 1e-8 ? Math.max(0, (currentRms - prevRms) / prevRms) : 0;
    envelope[i] = onset * (currentRms + 1e-8);
    prevRms = currentRms;
  }

  let maxVal = 0;
  for (let i = 0; i < envelope.length; i++) maxVal = Math.max(maxVal, envelope[i]);
  if (maxVal > 0) {
    for (let i = 0; i < envelope.length; i++) envelope[i] /= maxVal;
  }
  return envelope;
}

/**
 * Autocorrelation-based BPM detection.
 * Searches lag range corresponding to 50–240 BPM.
 */
function detectBpmFromAudio(buffer: AudioBuffer): number | null {
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const envelope = buildOnsetEnvelope(channel, sampleRate);
  const envelopeRate = sampleRate / ENVELOPE_HOP;

  // Lag range: 50 BPM = 1.2s, 240 BPM = 0.25s
  const minLagFrames = Math.floor(envelopeRate / (BPM_MAX / 60));
  const maxLagFrames = Math.min(
    Math.floor(envelope.length / 2),
    Math.ceil(envelopeRate / (BPM_MIN / 60))
  );

  if (minLagFrames >= maxLagFrames) return null;

  let bestBpm = 0;
  let bestCorr = -1;

  for (let lag = minLagFrames; lag <= maxLagFrames; lag++) {
    let sum = 0;
    let norm = 0;
    const n = envelope.length - lag;
    if (n <= 0) continue;
    for (let i = 0; i < n; i++) {
      sum += envelope[i] * envelope[i + lag];
      norm += envelope[i] * envelope[i];
    }
    const corr = norm > 1e-12 ? sum / Math.sqrt(norm) : 0;
    if (corr > bestCorr) {
      bestCorr = corr;
      const lagSeconds = lag / envelopeRate;
      bestBpm = 60 / lagSeconds;
    }
  }

  if (bestBpm < BPM_MIN || bestBpm > BPM_MAX) return null;
  return Math.round(bestBpm);
}

export interface AutoLoopResult {
  bpm: number;
  loopStart: number;
  loopEnd: number;
  /** True if BPM came from filename, false if from audio analysis */
  bpmFromFilename: boolean;
  /** True if leading silence was trimmed (first transient > 0) */
  trimmedSilence: boolean;
}

/**
 * Auto-detect BPM, trim leading silence, and compute loop bounds.
 * - BPM: from filename first, else from audio analysis
 * - Loop start: first transient time (or 0 if no leading silence)
 * - Loop end: exactly one bar (4 beats) after start, sample-accurate
 */
export function computeAutoLoop(
  buffer: AudioBuffer,
  fileName: string
): AutoLoopResult {
  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;

  // 1. BPM: filename first, then audio analysis
  const bpmFromName = parseBpmFromString(fileName);
  let bpm = bpmFromName?.bpm ?? null;
  if (bpm == null) {
    bpm = detectBpmFromAudio(buffer);
  }
  if (bpm == null) bpm = 120;

  // 2. First transient (leading silence trim)
  const firstTransientTime = detectFirstTransientTime(channel, sampleRate);
  const loopStart = firstTransientTime;

  // 3. Loop end: exactly one bar (4 beats) after start, sample-accurate
  // samples per bar = 4 * (60/bpm) * sampleRate = 240 * sampleRate / bpm
  const samplesPerBar = Math.round((240 * sampleRate) / bpm);
  const loopStartSample = Math.floor(loopStart * sampleRate);
  const loopEndSample = Math.min(
    buffer.length,
    loopStartSample + Math.max(1, samplesPerBar)
  );
  const loopEnd = loopEndSample / sampleRate;

  return {
    bpm,
    loopStart,
    loopEnd: Math.min(loopEnd, duration),
    bpmFromFilename: bpmFromName != null,
    trimmedSilence: firstTransientTime > 0.01,
  };
}
