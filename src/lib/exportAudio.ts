/**
 * Export audio with region trim and volume envelope applied.
 * Uses OfflineAudioContext for non-realtime processing.
 */

function readAscii(view: DataView, at: number, len: number): string {
  let s = "";
  for (let i = 0; i < len; i++) s += String.fromCharCode(view.getUint8(at + i));
  return s;
}

function padToWord(byteLength: number): number {
  return (byteLength + 1) & ~1;
}

function parseTagNumber(xml: string, tag: string): number | undefined {
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return undefined;
  const n = Number.parseFloat(m[1].trim());
  return Number.isFinite(n) ? n : undefined;
}

function parseTagText(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}>([^<]+)</${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return undefined;
  const text = m[1].trim();
  return text.length > 0 ? text : undefined;
}

export interface WavMetadata {
  sampleRate: number;
  totalFrames: number;
  sampleStartFrame?: number;
  sampleEndFrame?: number;
  sliceFrames: number[];
  tempo?: number;
  timeSignature?: string;
  rootKey?: number;
  tuningCents?: number;
}

/**
 * Parse WAV metadata used by the sample editor:
 * cue markers, iXML tags, and common values from smpl.
 */
export function parseWavMetadata(arrayBuffer: ArrayBuffer): WavMetadata | null {
  const view = new DataView(arrayBuffer);
  if (arrayBuffer.byteLength < 44) return null;
  if (readAscii(view, 0, 4) !== "RIFF" || readAscii(view, 8, 4) !== "WAVE") return null;

  let sampleRate = 0;
  let dataBytes = 0;
  let blockAlign = 0;
  const cueById = new Map<number, number>();
  const ixmlSliceFrames: number[] = [];
  let tempo: number | undefined;
  let timeSignature: string | undefined;
  let sampleStartFrame: number | undefined;
  let sampleEndFrame: number | undefined;
  let rootKey: number | undefined;
  let tuningCents: number | undefined;

  let pos = 12;
  while (pos + 8 <= arrayBuffer.byteLength) {
    const chunkId = readAscii(view, pos, 4);
    const chunkSize = view.getUint32(pos + 4, true);
    const chunkDataStart = pos + 8;
    const chunkDataEnd = chunkDataStart + chunkSize;
    if (chunkDataEnd > arrayBuffer.byteLength) break;

    if (chunkId === "fmt " && chunkSize >= 16) {
      sampleRate = view.getUint32(chunkDataStart + 4, true);
      blockAlign = view.getUint16(chunkDataStart + 12, true);
    } else if (chunkId === "data") {
      dataBytes = chunkSize;
    } else if (chunkId === "cue " && chunkSize >= 4) {
      const count = view.getUint32(chunkDataStart, true);
      let cuePos = chunkDataStart + 4;
      for (let i = 0; i < count; i++) {
        if (cuePos + 24 > chunkDataEnd) break;
        const id = view.getUint32(cuePos, true);
        const sampleOffset = view.getUint32(cuePos + 20, true);
        cueById.set(id, sampleOffset);
        cuePos += 24;
      }
    } else if (chunkId === "iXML" && chunkSize > 0) {
      const bytes = new Uint8Array(arrayBuffer, chunkDataStart, chunkSize);
      const xml = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
      tempo = parseTagNumber(xml, "TEMPO") ?? tempo;
      timeSignature = parseTagText(xml, "TIMESIG") ?? parseTagText(xml, "TIME_SIGNATURE") ?? timeSignature;
      sampleStartFrame = parseTagNumber(xml, "SAMPLE_START") ?? sampleStartFrame;
      sampleEndFrame = parseTagNumber(xml, "SAMPLE_END") ?? sampleEndFrame;

      const sliceMatches = xml.matchAll(/<SLICE\s+[^>]*position="(\d+)"[^>]*>/gi);
      for (const m of sliceMatches) {
        const frame = Number.parseInt(m[1], 10);
        if (Number.isFinite(frame)) {
          ixmlSliceFrames.push(frame);
        }
      }
    } else if (chunkId === "smpl" && chunkSize >= 36) {
      const midiUnity = view.getUint32(chunkDataStart + 12, true);
      const midiPitchFraction = view.getUint32(chunkDataStart + 16, true);
      if (midiUnity <= 127) rootKey = midiUnity;
      // midiPitchFraction uses 0x80000000 == +50 cents
      if (midiPitchFraction > 0) {
        tuningCents = (midiPitchFraction / 0x100000000) * 100;
      }

      const loops = view.getUint32(chunkDataStart + 28, true);
      if (loops > 0 && chunkSize >= 36 + 24) {
        const loopStart = view.getUint32(chunkDataStart + 36 + 8, true);
        const loopEnd = view.getUint32(chunkDataStart + 36 + 12, true);
        sampleStartFrame = sampleStartFrame ?? loopStart;
        sampleEndFrame = sampleEndFrame ?? loopEnd;
      }
    }

    pos = chunkDataEnd + (chunkSize % 2);
  }

  if (sampleRate <= 0) return null;
  const totalFrames = blockAlign > 0 ? Math.floor(dataBytes / blockAlign) : 0;

  const sampleStartCue = cueById.get(1);
  const sampleEndCue = cueById.get(2);
  sampleStartFrame = sampleStartFrame ?? sampleStartCue;
  sampleEndFrame = sampleEndFrame ?? sampleEndCue;

  let sliceFrames: number[] = [];
  const cueSliceFrames = Array.from(cueById.entries())
    .filter(([id]) => id >= 100)
    .map(([, frame]) => frame)
    .filter((f) => f >= 0)
    .sort((a, b) => a - b);

  if (cueSliceFrames.length > 0) {
    sliceFrames = cueSliceFrames;
  } else if (ixmlSliceFrames.length > 0) {
    // Only use iXML slice positions when no cue chunk slice markers are present,
    // to avoid duplicating frames when both sources exist.
    sliceFrames = [...ixmlSliceFrames].sort((a, b) => a - b);
  } else {
    // Backward compatibility with older exports that used cue ids 1..N for slices.
    sliceFrames = Array.from(cueById.values())
      .filter((f) => f >= 0)
      .sort((a, b) => a - b);
  }

  return {
    sampleRate,
    totalFrames,
    sampleStartFrame,
    sampleEndFrame,
    sliceFrames,
    tempo,
    timeSignature,
    rootKey,
    tuningCents,
  };
}

/**
 * Parse WAV file for embedded cue markers.
 * Returns slice sample frame positions and sample rate, or null if no cue chunk.
 */
export function parseWavCueMarkers(
  arrayBuffer: ArrayBuffer
): { sampleFrames: number[]; sampleRate: number } | null {
  const parsed = parseWavMetadata(arrayBuffer);
  if (!parsed || parsed.sampleRate <= 0 || parsed.sliceFrames.length === 0) return null;
  return { sampleFrames: parsed.sliceFrames, sampleRate: parsed.sampleRate };
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
  /** Write cue chunk and LIST adtl markers. Default true when slices exist. */
  embeddedMarkers?: boolean;
  /** Write iXML chunk. Default true. */
  ixmlMetadata?: boolean;
  /** Export individual slice files to a folder. Default false. */
  exportSliceFiles?: boolean;
  /** BPM for iXML TEMPO. Omit if unknown. */
  tempo?: number;
  /** Time signature for iXML (e.g. "4/4"). Omit if unknown. */
  timeSignature?: string;
  /** Sample start time in seconds relative to full file. Defaults to regionStart. */
  sampleStart?: number;
  /** Sample end time in seconds relative to full file. Defaults to regionEnd. */
  sampleEnd?: number;
  /** MIDI root key (0-127). */
  rootKey?: number;
  /** Tuning in cents. */
  tuningCents?: number;
}

/**
 * Get gain multiplier at a given time from envelope points.
 * Linear interpolation between points.
 */
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

interface EncodeWavOptions {
  /** Slice start times in seconds (relative to buffer start at 0). */
  sliceTimes?: number[];
  /** Write cue/LIST markers. */
  embeddedMarkers?: boolean;
  /** Write iXML chunk. */
  ixmlMetadata?: boolean;
  tempo?: number;
  timeSignature?: string;
  sampleStartFrame?: number;
  sampleEndFrame?: number;
  rootKey?: number;
  tuningCents?: number;
}

/**
 * Encode AudioBuffer to WAV PCM (little-endian).
 * Chunk order: RIFF -> fmt -> data -> cue -> LIST(adtl) -> iXML
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
  const sliceFrames = slices
    .map((t) => Math.floor(t * sampleRate))
    .filter((f) => f >= 0 && f < buffer.length)
    .sort((a, b) => a - b)
    .filter((f, i, arr) => i === 0 || f !== arr[i - 1]);

  const sampleStartFrame = Math.max(0, Math.min(buffer.length - 1, Math.floor(options?.sampleStartFrame ?? 0)));
  const sampleEndFrame = Math.max(
    sampleStartFrame + 1,
    Math.min(buffer.length, Math.floor(options?.sampleEndFrame ?? buffer.length)),
  );

  const embeddedMarkers = options?.embeddedMarkers ?? true;
  const ixmlMetadata = options?.ixmlMetadata ?? false;

  const cueEntries: { id: number; frame: number }[] = [];
  if (embeddedMarkers) {
    cueEntries.push({ id: 1, frame: sampleStartFrame });
    cueEntries.push({ id: 2, frame: sampleEndFrame });
    for (let i = 0; i < sliceFrames.length; i++) {
      cueEntries.push({ id: 100 + i, frame: sliceFrames[i] });
    }
  }

  // cue chunk payload: 4 (count) + 24 * n
  const cueChunkPayloadSize = cueEntries.length > 0 ? 4 + cueEntries.length * 24 : 0;
  const cueChunkBytes = cueChunkPayloadSize > 0 ? 8 + cueChunkPayloadSize : 0;

  // LIST adtl with ltxt + labl for slices only
  let listChunkBytes = 0;
  if (embeddedMarkers && sliceFrames.length > 0) {
    let subchunksBytes = 0;
    for (let i = 0; i < sliceFrames.length; i++) {
      const thisStart = sliceFrames[i];
      const nextStart = i < sliceFrames.length - 1 ? sliceFrames[i + 1] : sampleEndFrame;

      // ltxt: size=20 bytes payload
      subchunksBytes += 8 + 20;

      // labl: payload=4(cue id)+text+NUL, padded to even
      const label = `Slice_${String(i + 1).padStart(2, "0")}`;
      const textBytes = new TextEncoder().encode(label + "\0");
      const paddedTextLen = padToWord(textBytes.length);
      subchunksBytes += 8 + 4 + paddedTextLen;
    }

    // LIST payload is 4-byte type + subchunks
    listChunkBytes = 8 + 4 + subchunksBytes;
  }

  // iXML payload
  let ixmlChunkBytes = 0;
  let ixmlXmlBytes: Uint8Array | null = null;
  if (ixmlMetadata) {
    const parts: string[] = [];
    parts.push(`<SAMPLE_START>${sampleStartFrame}</SAMPLE_START>`);
    parts.push(`<SAMPLE_END>${sampleEndFrame}</SAMPLE_END>`);
    parts.push(`<SLICE_COUNT>${sliceFrames.length}</SLICE_COUNT>`);
    parts.push("<SLICES>");
    for (let i = 0; i < sliceFrames.length; i++) {
      parts.push(`  <SLICE index=\"${i}\" position=\"${sliceFrames[i]}\" />`);
    }
    parts.push("</SLICES>");
    if (options?.tempo != null && Number.isFinite(options.tempo)) {
      parts.push(`<TEMPO>${options.tempo.toFixed(3)}</TEMPO>`);
    }
    if (options?.timeSignature && options.timeSignature.length > 0) {
      parts.push(`<TIMESIG>${options.timeSignature}</TIMESIG>`);
    }
    if (options?.rootKey != null && Number.isFinite(options.rootKey)) {
      parts.push(`<ROOT_KEY>${Math.max(0, Math.min(127, Math.round(options.rootKey)))}</ROOT_KEY>`);
    }
    if (options?.tuningCents != null && Number.isFinite(options.tuningCents)) {
      parts.push(`<TUNING_CENTS>${options.tuningCents.toFixed(3)}</TUNING_CENTS>`);
    }

    const xml = `<IXML>\n  ${parts.join("\n  ")}\n</IXML>`;
    const raw = new TextEncoder().encode(xml);
    ixmlXmlBytes = raw;
    ixmlChunkBytes = 8 + padToWord(raw.length);
  }

  const dataChunkBytes = 8 + dataLength;
  const fmtChunkBytes = 8 + 16;
  const totalSize = 12 + fmtChunkBytes + dataChunkBytes + cueChunkBytes + listChunkBytes + ixmlChunkBytes;
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

  for (let i = 0; i < buffer.length; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, channels[c][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(pos, intSample, true);
      pos += 2;
    }
  }

  if (cueEntries.length > 0) {
    writeString("cue ", pos);
    view.setUint32(pos + 4, cueChunkPayloadSize, true);
    view.setUint32(pos + 8, cueEntries.length, true);
    pos += 12;

    for (const entry of cueEntries) {
      view.setUint32(pos, entry.id, true); // dwName
      view.setUint32(pos + 4, 0, true); // dwPosition
      writeString("data", pos + 8); // fccChunk
      view.setUint32(pos + 12, 0, true); // dwChunkStart
      view.setUint32(pos + 16, 0, true); // dwBlockStart
      view.setUint32(pos + 20, entry.frame, true); // dwSampleOffset
      pos += 24;
    }
  }

  if (embeddedMarkers && sliceFrames.length > 0) {
    const listStart = pos;
    writeString("LIST", pos);
    pos += 8;
    writeString("adtl", pos);
    pos += 4;

    for (let i = 0; i < sliceFrames.length; i++) {
      const cueId = 100 + i;
      const thisStart = sliceFrames[i];
      const nextStart = i < sliceFrames.length - 1 ? sliceFrames[i + 1] : sampleEndFrame;
      const sampleLength = Math.max(0, nextStart - thisStart);

      // ltxt (slices only)
      writeString("ltxt", pos);
      view.setUint32(pos + 4, 20, true);
      view.setUint32(pos + 8, cueId, true); // dwName
      view.setUint32(pos + 12, sampleLength, true); // dwSampleLength
      view.setUint32(pos + 16, 0, true); // dwPurposeID
      view.setUint16(pos + 20, 0, true); // wCountry
      view.setUint16(pos + 22, 0, true); // wLanguage
      view.setUint16(pos + 24, 0, true); // wDialect
      view.setUint16(pos + 26, 0, true); // wCodePage
      pos += 28;

      // Optional label: Slice_01
      const label = `Slice_${String(i + 1).padStart(2, "0")}`;
      const labelBytes = new TextEncoder().encode(label + "\0");
      const paddedLabelBytes = padToWord(labelBytes.length);
      writeString("labl", pos);
      view.setUint32(pos + 4, 4 + labelBytes.length, true);
      view.setUint32(pos + 8, cueId, true);
      for (let j = 0; j < labelBytes.length; j++) view.setUint8(pos + 12 + j, labelBytes[j]);
      if (paddedLabelBytes > labelBytes.length) {
        view.setUint8(pos + 12 + labelBytes.length, 0);
      }
      pos += 12 + paddedLabelBytes;
    }

    view.setUint32(listStart + 4, pos - listStart - 8, true);
  }

  if (ixmlXmlBytes) {
    writeString("iXML", pos);
    view.setUint32(pos + 4, ixmlXmlBytes.length, true);
    pos += 8;
    for (let i = 0; i < ixmlXmlBytes.length; i++) view.setUint8(pos + i, ixmlXmlBytes[i]);
    pos += ixmlXmlBytes.length;
    if (ixmlXmlBytes.length % 2 === 1) {
      view.setUint8(pos, 0);
      pos += 1;
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
  duration: number = 0,
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
  const offlineCtx = new OfflineAudioContext(decoded.numberOfChannels, outputLength, decoded.sampleRate);

  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.start(0, regionStart, regionDuration);
  source.stop(regionDuration);

  if (hasEnvelope) {
    const gainNode = offlineCtx.createGain();
    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);

    const envelopeInterval = 0.01;
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
  const embeddedMarkers = params.embeddedMarkers ?? hasSlices;
  const ixmlMetadata = params.ixmlMetadata ?? true;
  const exportSliceFiles = (params.exportSliceFiles ?? false) && hasSlices;

  const sampleStart = params.sampleStart ?? regionStart;
  const sampleEnd = params.sampleEnd ?? regionEnd;

  const sampleStartInBuffer = Math.max(0, Math.min(regionDuration, sampleStart - regionStart));
  const sampleEndInBuffer = Math.max(sampleStartInBuffer + 1 / rendered.sampleRate, Math.min(regionDuration, sampleEnd - regionStart));
  const sampleStartFrame = Math.floor(sampleStartInBuffer * rendered.sampleRate);
  const sampleEndFrame = Math.floor(sampleEndInBuffer * rendered.sampleRate);

  const sliceTimesInBuffer = slices
    .map((s) => s.time - regionStart)
    .filter((t) => t >= sampleStartInBuffer && t < sampleEndInBuffer)
    .sort((a, b) => a - b);

  const encodeOpts: EncodeWavOptions = {
    embeddedMarkers,
    ixmlMetadata,
    sliceTimes: sliceTimesInBuffer,
    tempo: params.tempo,
    timeSignature: params.timeSignature,
    sampleStartFrame,
    sampleEndFrame,
    rootKey: params.rootKey,
    tuningCents: params.tuningCents,
  };

  const mainBlob = encodeWav(rendered, encodeOpts);

  let sliceBlobs: Blob[] | undefined;
  if (exportSliceFiles && sliceTimesInBuffer.length > 0) {
    const sampleRate = rendered.sampleRate;
    const numChannels = rendered.numberOfChannels;
    sliceBlobs = [];
    for (let i = 0; i < sliceTimesInBuffer.length; i++) {
      const startTime = sliceTimesInBuffer[i];
      const endTime = i < sliceTimesInBuffer.length - 1 ? sliceTimesInBuffer[i + 1] : sampleEndInBuffer;
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
  startTimeSeconds: number,
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
  startTimeSeconds: number,
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
