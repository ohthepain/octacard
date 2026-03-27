/**
 * Detects non-silent content inside a region and returns tightened bounds.
 * Used by named-region "Auto-detect region" in the wave editor.
 */

const ABS_SILENCE_THRESHOLD = 5e-5;
const RELATIVE_SILENCE_THRESHOLD = 0.01;
const MIN_OUTPUT_SAMPLES = 8;

export interface RegionSilenceTrimResult {
  start: number;
  end: number;
  trimmedStart: boolean;
  trimmedEnd: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function trimSilenceInRegion(
  buffer: AudioBuffer,
  regionStartSec: number,
  regionEndSec: number,
): RegionSilenceTrimResult {
  const sampleRate = buffer.sampleRate;
  const totalSamples = buffer.length;
  const startSample = clamp(
    Math.floor(regionStartSec * sampleRate),
    0,
    totalSamples,
  );
  const endSample = clamp(
    Math.ceil(regionEndSec * sampleRate),
    startSample,
    totalSamples,
  );

  if (endSample - startSample <= MIN_OUTPUT_SAMPLES) {
    return {
      start: startSample / sampleRate,
      end: endSample / sampleRate,
      trimmedStart: false,
      trimmedEnd: false,
    };
  }

  const channels = Array.from({ length: buffer.numberOfChannels }, (_, ch) =>
    buffer.getChannelData(ch),
  );

  let peakAbs = 0;
  for (let i = startSample; i < endSample; i++) {
    let samplePeak = 0;
    for (const ch of channels) {
      const v = Math.abs(ch[i] ?? 0);
      if (v > samplePeak) samplePeak = v;
    }
    if (samplePeak > peakAbs) peakAbs = samplePeak;
  }

  if (peakAbs <= ABS_SILENCE_THRESHOLD) {
    return {
      start: startSample / sampleRate,
      end: endSample / sampleRate,
      trimmedStart: false,
      trimmedEnd: false,
    };
  }

  const threshold = Math.max(ABS_SILENCE_THRESHOLD, peakAbs * RELATIVE_SILENCE_THRESHOLD);

  let firstSignal = -1;
  for (let i = startSample; i < endSample; i++) {
    let samplePeak = 0;
    for (const ch of channels) {
      const v = Math.abs(ch[i] ?? 0);
      if (v > samplePeak) samplePeak = v;
    }
    if (samplePeak >= threshold) {
      firstSignal = i;
      break;
    }
  }

  if (firstSignal < 0) {
    return {
      start: startSample / sampleRate,
      end: endSample / sampleRate,
      trimmedStart: false,
      trimmedEnd: false,
    };
  }

  let lastSignal = -1;
  for (let i = endSample - 1; i >= startSample; i--) {
    let samplePeak = 0;
    for (const ch of channels) {
      const v = Math.abs(ch[i] ?? 0);
      if (v > samplePeak) samplePeak = v;
    }
    if (samplePeak >= threshold) {
      lastSignal = i;
      break;
    }
  }

  if (lastSignal < firstSignal) {
    return {
      start: startSample / sampleRate,
      end: endSample / sampleRate,
      trimmedStart: false,
      trimmedEnd: false,
    };
  }

  const nextStartSample = firstSignal;
  const nextEndSample = Math.min(endSample, lastSignal + 1);
  const usableLen = nextEndSample - nextStartSample;
  if (usableLen <= MIN_OUTPUT_SAMPLES) {
    return {
      start: startSample / sampleRate,
      end: endSample / sampleRate,
      trimmedStart: false,
      trimmedEnd: false,
    };
  }

  return {
    start: nextStartSample / sampleRate,
    end: nextEndSample / sampleRate,
    trimmedStart: nextStartSample > startSample,
    trimmedEnd: nextEndSample < endSample,
  };
}
