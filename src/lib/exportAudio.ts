/**
 * Export audio with region trim and volume envelope applied.
 * Uses OfflineAudioContext for non-realtime processing.
 */

/**
 * Parse WAV file for embedded cue markers.
 * Returns sample frame positions and sample rate, or null if no cue chunk or invalid WAV.
 */
export function parseWavCueMarkers(
  arrayBuffer: ArrayBuffer
): { sampleFrames: number[]; sampleRate: number } | null {
  const view = new DataView(arrayBuffer);
  if (arrayBuffer.byteLength < 44) return null;

  const readStr = (at: number, len: number) => {
    let s = "";
    for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(at + i));
    return s;
  };

  if (readStr(0, 4) !== "RIFF" || readStr(8, 4) !== "WAVE") return null;

  let sampleRate = 0;
  const sampleFrames: number[] = [];
  let pos = 12;

  while (pos + 8 <= arrayBuffer.byteLength) {
    const chunkId = readStr(pos, 4);
    const chunkSize = view.getUint32(pos + 4, true);
    pos += 8;

    if (chunkId === "fmt " && chunkSize >= 4 && pos + 4 <= arrayBuffer.byteLength) {
      sampleRate = view.getUint32(pos + 4, true);
    } else if (chunkId === "cue " && chunkSize >= 4 && pos + 4 <= arrayBuffer.byteLength) {
      const count = view.getUint32(pos, true);
      pos += 4;
      for (let i = 0; i < count && pos + 24 <= arrayBuffer.byteLength; i++) {
        const position = view.getUint32(pos + 4, true);
        sampleFrames.push(position);
        pos += 24;
      }
      pos += chunkSize - 4 - 24 * count;
      if (pos < 0) pos = 0;
    }

    pos += chunkSize;
    if (pos > arrayBuffer.byteLength) break;
  }

  if (sampleFrames.length === 0 || sampleRate <= 0) return null;
  return { sampleFrames, sampleRate };
}

export interface EnvelopePoint {
  time: number;
  volume: number;
}

export interface ExportParams {
  regionStart?: number;
  regionEnd?: number;
  envelopePoints?: EnvelopePoint[];
  /** Slice start times in seconds (relative to full file). Used for cue chunk and slice file export. */
  slices?: { time: number }[];
  /** Write cue chunk and LIST adtl labl for slice markers. Default true when slices exist. */
  embeddedMarkers?: boolean;
  /** Write iXML chunk with tempo and time signature. Default true. */
  ixmlMetadata?: boolean;
  /** Export individual slice files to a folder. Default false. */
  exportSliceFiles?: boolean;
  /** BPM for iXML TEMPO. Omit if unknown. */
  tempo?: number;
  /** Time signature for iXML (e.g. "4/4"). Omit if unknown. */
  timeSignature?: string;
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

interface EncodeWavOptions {
  /** Slice start times in seconds (relative to buffer start at 0). Sample frame offsets computed from these. */
  sliceTimes?: number[];
  /** Write cue + LIST adtl labl. Only if sliceTimes has entries. */
  embeddedMarkers?: boolean;
  /** Write iXML chunk. */
  ixmlMetadata?: boolean;
  tempo?: number;
  timeSignature?: string;
}

function padToWord(byteLength: number): number {
  return (byteLength + 1) & ~1;
}

/**
 * Encode AudioBuffer to WAV format.
 * Supports optional cue chunk, LIST adtl labl, and iXML metadata.
 * Chunk order: RIFF → fmt → data → cue → LIST (adtl) → iXML
 */
function encodeWav(buffer: AudioBuffer, options?: EncodeWavOptions): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataLength = buffer.length * blockAlign;

  const slices = options?.sliceTimes ?? [];
  const hasSlices = slices.length > 0;
  const embeddedMarkers = (options?.embeddedMarkers ?? true) && hasSlices;
  const ixmlMetadata = options?.ixmlMetadata ?? false;
  const tempo = options?.tempo;
  const timeSignature = options?.timeSignature;

  // Filter slices to those within buffer bounds and convert to sample frame offsets
  const sliceFrames = slices
    .map((t) => Math.floor(t * sampleRate))
    .filter((f) => f >= 0 && f < buffer.length)
    .sort((a, b) => a - b);

  // Cue chunk: 4 (id) + 4 (size) + 4 (count) + 24 * count
  let cueChunkSize = 0;
  if (embeddedMarkers && sliceFrames.length > 0) {
    cueChunkSize = 4 + 4 + 4 + 24 * sliceFrames.length;
  }

  // LIST adtl: 4 (LIST) + 4 (size) + 4 (adtl) + labl chunks
  let listChunkSize = 0;
  if (embeddedMarkers && sliceFrames.length > 0) {
    const lablLabels = sliceFrames.map((_, i) => `Slice ${String(i + 1).padStart(2, "0")}`);
    let adtlDataSize = 0;
    for (let i = 0; i < lablLabels.length; i++) {
      const text = lablLabels[i] + "\0";
      const lablSize = 4 + 4 + 4 + padToWord(text.length); // labl id + size + cue id + text
      adtlDataSize += lablSize;
    }
    listChunkSize = 4 + 4 + 4 + adtlDataSize; // LIST id + size + adtl + labls
  }

  // iXML chunk
  let ixmlChunkSize = 0;
  if (ixmlMetadata && (tempo != null || timeSignature != null)) {
    const parts: string[] = [];
    if (tempo != null && Number.isFinite(tempo)) parts.push(`  <TEMPO>${tempo.toFixed(3)}</TEMPO>`);
    if (timeSignature != null && timeSignature.length > 0)
      parts.push(`  <TIME_SIGNATURE>${timeSignature}</TIME_SIGNATURE>`);
    if (parts.length > 0) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<BWFXML>\n${parts.join("\n")}\n</BWFXML>`;
      ixmlChunkSize = 4 + 4 + padToWord(xml.length); // iXML id + size + padding
    }
  }

  const dataChunkSize = 8 + dataLength; // data id + size + payload
  const fmtChunkSize = 8 + 16;
  const totalSize = 12 + fmtChunkSize + dataChunkSize + cueChunkSize + listChunkSize + ixmlChunkSize;
  const riffSize = totalSize - 8;

  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (str: string, at: number) => {
    for (let i = 0; i < str.length; i++) view.setUint8(at + i, str.charCodeAt(i));
  };

  let pos = 0;

  writeString("RIFF", pos);
  view.setUint32(pos + 4, riffSize, true);
  writeString("WAVE", pos + 8);
  pos += 12;

  writeString("fmt ", pos);
  view.setUint32(pos + 4, 16, true);
  view.setUint16(pos + 8, format, true);
  view.setUint16(pos + 10, numChannels, true);
  view.setUint32(pos + 12, sampleRate, true);
  view.setUint32(pos + 16, sampleRate * blockAlign, true);
  view.setUint16(pos + 20, blockAlign, true);
  view.setUint16(pos + 22, bitDepth, true);
  pos += 8 + 16;

  writeString("data", pos);
  view.setUint32(pos + 4, dataLength, true);
  pos += 8;

  const channels: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) channels.push(buffer.getChannelData(c));

  const dataStart = pos;
  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, intSample, true);
      pos += 2;
    }
  }

  // Cue chunk
  if (embeddedMarkers && sliceFrames.length > 0) {
    writeString("cue ", pos);
    view.setUint32(pos + 4, 4 + 24 * sliceFrames.length, true);
    view.setUint32(pos + 8, sliceFrames.length, true);
    pos += 12;
    for (let i = 0; i < sliceFrames.length; i++) {
      const frame = sliceFrames[i];
      const bytePos = dataStart + frame * blockAlign;
      view.setUint32(pos, i + 1, true); // cue point id (1-based)
      view.setUint32(pos + 4, frame, true); // position (sample frame)
      writeString("data", pos + 8);
      view.setUint32(pos + 12, 0, true); // chunk_start (no wavl)
      view.setUint32(pos + 16, bytePos, true); // block_start
      view.setUint32(pos + 20, 0, true); // sample_offset
      pos += 24;
    }
  }

  // LIST adtl with labl subchunks
  if (embeddedMarkers && sliceFrames.length > 0) {
    const listStart = pos;
    writeString("LIST", pos);
    pos += 8; // placeholder for size
    writeString("adtl", pos);
    pos += 4;
    for (let i = 0; i < sliceFrames.length; i++) {
      const label = `Slice ${String(i + 1).padStart(2, "0")}`;
      const text = label + "\0";
      const textPadded = padToWord(text.length);
      writeString("labl", pos);
      view.setUint32(pos + 4, 4 + textPadded, true); // cue id + text
      view.setUint32(pos + 8, i + 1, true); // cue point id
      const enc = new TextEncoder();
      const bytes = enc.encode(text);
      for (let j = 0; j < bytes.length; j++) view.setUint8(pos + 12 + j, bytes[j]);
      pos += 12 + textPadded;
    }
    view.setUint32(listStart + 4, pos - listStart - 8, true);
  }

  // iXML chunk
  if (ixmlMetadata && (tempo != null || timeSignature != null)) {
    const parts: string[] = [];
    if (tempo != null && Number.isFinite(tempo)) parts.push(`  <TEMPO>${tempo.toFixed(3)}</TEMPO>`);
    if (timeSignature != null && timeSignature.length > 0)
      parts.push(`  <TIME_SIGNATURE>${timeSignature}</TIME_SIGNATURE>`);
    if (parts.length > 0) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<BWFXML>\n${parts.join("\n")}\n</BWFXML>`;
      writeString("iXML", pos);
      const xmlBytes = new TextEncoder().encode(xml);
      const paddedLen = padToWord(xmlBytes.length);
      view.setUint32(pos + 4, paddedLen, true);
      for (let i = 0; i < xmlBytes.length; i++) view.setUint8(pos + 8 + i, xmlBytes[i]);
      pos += 8 + paddedLen;
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

export interface ExportResult {
  mainBlob: Blob;
  /** Present when exportSliceFiles is true. Blobs in slice order for BaseName_01.wav, etc. */
  sliceBlobs?: Blob[];
}

/**
 * Export audio blob with region trim and volume envelope applied.
 * If duration is 0, it is derived from the decoded audio.
 * When slices exist and embeddedMarkers/ixmlMetadata/exportSliceFiles are set, includes markers and/or slice files.
 */
export async function exportAudioWithEdits(
  audioBlob: Blob,
  params: ExportParams,
  duration: number = 0
): Promise<ExportResult> {
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

  const slices = params.slices ?? [];
  const hasSlices = slices.length > 0;
  const embeddedMarkers = (params.embeddedMarkers ?? true) && hasSlices;
  const ixmlMetadata = params.ixmlMetadata ?? true;
  const exportSliceFiles = (params.exportSliceFiles ?? false) && hasSlices;

  // Slice times relative to exported buffer (0 = start of region)
  const sliceTimesInBuffer = slices
    .map((s) => s.time - regionStart)
    .filter((t) => t >= 0 && t < regionDuration)
    .sort((a, b) => a - b);

  const encodeOpts: EncodeWavOptions = {
    embeddedMarkers: embeddedMarkers && sliceTimesInBuffer.length > 0,
    ixmlMetadata: ixmlMetadata && (params.tempo != null || params.timeSignature != null),
    sliceTimes: sliceTimesInBuffer,
    tempo: params.tempo,
    timeSignature: params.timeSignature,
  };

  const mainBlob = encodeWav(rendered, encodeOpts);

  let sliceBlobs: Blob[] | undefined;
  if (exportSliceFiles && sliceTimesInBuffer.length > 0) {
    const sampleRate = rendered.sampleRate;
    const numChannels = rendered.numberOfChannels;
    sliceBlobs = [];
    for (let i = 0; i < sliceTimesInBuffer.length; i++) {
      const startTime = sliceTimesInBuffer[i];
      const endTime = i < sliceTimesInBuffer.length - 1 ? sliceTimesInBuffer[i + 1] : regionDuration;
      const startFrame = Math.floor(startTime * sampleRate);
      const endFrame = Math.floor(endTime * sampleRate);
      const sliceLength = Math.max(1, endFrame - startFrame);
      const sliceBuffer = offlineCtx.createBuffer(numChannels, sliceLength, sampleRate);
      for (let c = 0; c < numChannels; c++) {
        const src = rendered.getChannelData(c);
        const dst = sliceBuffer.getChannelData(c);
        for (let j = 0; j < sliceLength; j++) dst[j] = src[startFrame + j];
      }
      sliceBlobs.push(encodeWav(sliceBuffer));
    }
  }

  return { mainBlob, sliceBlobs };
}

/**
 * Replace a segment of existing audio with recorded audio, starting at startTimeSeconds.
 */
export async function replaceSegment(
  existingBlob: Blob,
  recordedBlob: Blob,
  startTimeSeconds: number
): Promise<Blob> {
  const ctx = new AudioContext();
  const [existing, recorded] = await Promise.all([
    ctx.decodeAudioData(await existingBlob.arrayBuffer()),
    ctx.decodeAudioData(await recordedBlob.arrayBuffer()),
  ]);

  const sampleRate = existing.sampleRate;
  const channels = existing.numberOfChannels;
  const startSample = Math.floor(startTimeSeconds * sampleRate);
  const recordedLength = recorded.length;
  const existingLength = existing.length;
  const replaceLength = Math.min(recordedLength, Math.max(0, existingLength - startSample));
  if (replaceLength <= 0 || startSample < 0) {
    await ctx.close();
    return encodeWav(existing);
  }

  const outputLength = Math.max(existingLength, startSample + recordedLength);
  const output = ctx.createBuffer(channels, outputLength, sampleRate);
  await ctx.close();

  for (let c = 0; c < channels; c++) {
    const outCh = output.getChannelData(c);
    const existCh = existing.getChannelData(c);
    const recCh = recorded.getChannelData(Math.min(c, recorded.numberOfChannels - 1));
    outCh.set(existCh);
    for (let i = 0; i < replaceLength; i++) {
      outCh[startSample + i] = recCh[i];
    }
    if (recordedLength > existingLength - startSample) {
      for (let i = existingLength - startSample; i < recordedLength; i++) {
        outCh[startSample + i] = recCh[i];
      }
    }
  }
  return encodeWav(output);
}

/**
 * Mix overdub recording into existing audio at startTime.
 * Returns a new Blob with existing + overdub mixed (additive).
 */
export async function mixOverdub(
  existingBlob: Blob,
  overdubBlob: Blob,
  startTimeSeconds: number
): Promise<Blob> {
  const ctx = new AudioContext();
  const [existing, overdub] = await Promise.all([
    ctx.decodeAudioData(await existingBlob.arrayBuffer()),
    ctx.decodeAudioData(await overdubBlob.arrayBuffer()),
  ]);

  const sampleRate = existing.sampleRate;
  const channels = existing.numberOfChannels;
  const startSample = Math.floor(startTimeSeconds * sampleRate);
  const overdubLength = overdub.length;
  const existingLength = existing.length;
  const endSample = Math.max(existingLength, startSample + overdubLength);
  const outputLength = endSample;

  const offlineCtx = new OfflineAudioContext(channels, outputLength, sampleRate);

  const existingSource = offlineCtx.createBufferSource();
  existingSource.buffer = existing;
  existingSource.start(0);
  existingSource.connect(offlineCtx.destination);

  const overdubSource = offlineCtx.createBufferSource();
  overdubSource.buffer = overdub;
  overdubSource.start(startSample / sampleRate);
  overdubSource.connect(offlineCtx.destination);

  const rendered = await offlineCtx.startRendering();
  await ctx.close();
  return encodeWav(rendered);
}
