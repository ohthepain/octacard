/**
 * Export audio with region trim and volume envelope applied.
 * Uses OfflineAudioContext for non-realtime processing.
 */

export interface EnvelopePoint {
  time: number;
  volume: number;
}

export interface ExportParams {
  regionStart?: number;
  regionEnd?: number;
  envelopePoints?: EnvelopePoint[];
}

/**
 * Get gain multiplier at a given time from envelope points.
 * Linear interpolation between points.
 */
function getGainAtTime(points: EnvelopePoint[], time: number): number {
  if (!points.length) return 1;
  if (points.length === 1) return points[0].volume;

  // Before first point
  if (time <= points[0].time) return points[0].volume;
  // After last point
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

/**
 * Encode AudioBuffer to WAV format.
 */
function encodeWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  const offset = 0;

  const writeString = (str: string, at: number) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(at + i, str.charCodeAt(i));
    }
  };

  writeString("RIFF", offset);
  view.setUint32(offset + 4, bufferLength - 8, true);
  writeString("WAVE", offset + 8);
  writeString("fmt ", offset + 12);
  view.setUint32(offset + 16, 16, true); // fmt chunk size
  view.setUint16(offset + 20, format, true); // audio format (1 = PCM)
  view.setUint16(offset + 22, numChannels, true);
  view.setUint32(offset + 24, sampleRate, true);
  view.setUint32(offset + 28, sampleRate * blockAlign, true); // byte rate
  view.setUint16(offset + 32, blockAlign, true);
  view.setUint16(offset + 34, bitDepth, true);
  writeString("data", offset + 36);
  view.setUint32(offset + 40, dataLength, true);

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channels.push(buffer.getChannelData(c));
  }

  let pos = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, intSample, true);
      pos += 2;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

/**
 * Export audio blob with region trim and volume envelope applied.
 * If duration is 0, it is derived from the decoded audio.
 */
export async function exportAudioWithEdits(
  audioBlob: Blob,
  params: ExportParams,
  duration: number = 0
): Promise<Blob> {
  const arrayBuffer = await audioBlob.arrayBuffer();
  const decodeCtx = new AudioContext();
  const decoded = await decodeCtx.decodeAudioData(arrayBuffer);
  await decodeCtx.close();

  const dur = duration > 0 ? duration : decoded.duration;
  const regionStart = params.regionStart ?? 0;
  const regionEnd = params.regionEnd ?? dur;
  const regionDuration = Math.max(0.001, regionEnd - regionStart);

  const envelopePoints = params.envelopePoints ?? [];
  const hasEnvelope = envelopePoints.length > 0;

  const outputLength = Math.ceil(regionDuration * decoded.sampleRate);
  const offlineCtx = new OfflineAudioContext(
    decoded.numberOfChannels,
    outputLength,
    decoded.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.start(0, regionStart, regionDuration);
  source.stop(regionDuration);

  if (hasEnvelope) {
    const gainNode = offlineCtx.createGain();
    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    const envelopeInterval = 0.01; // 10ms steps for gain automation
    let lastGain = getGainAtTime(envelopePoints, regionStart);

    gainNode.gain.setValueAtTime(lastGain, 0);

    for (let t = envelopeInterval; t < regionDuration; t += envelopeInterval) {
      const gain = getGainAtTime(envelopePoints, regionStart + t);
      gainNode.gain.linearRampToValueAtTime(gain, t);
      lastGain = gain;
    }
    gainNode.gain.setValueAtTime(lastGain, regionDuration);
  } else {
    source.connect(offlineCtx.destination);
  }

  const rendered = await offlineCtx.startRendering();
  return encodeWav(rendered);
}
