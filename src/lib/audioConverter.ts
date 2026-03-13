import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { analyzeFilenameForNote } from './batch-math';

let ffmpegInstance: FFmpeg | null = null;
let isInitialized = false;
let isInitializing = false;

/** Serialize FFmpeg conversions to avoid FS conflicts when multiple AIFF loads run in parallel. */
let conversionMutex = Promise.resolve<void>(undefined);

function withConversionMutex<T>(fn: () => Promise<T>): Promise<T> {
  const prev = conversionMutex;
  let resolveMutex: () => void;
  conversionMutex = new Promise<void>((r) => {
    resolveMutex = r;
  });
  return prev.then(
    () =>
      fn().finally(() => {
        resolveMutex!();
      }),
    (err) => {
      resolveMutex!();
      throw err;
    }
  );
}

export function cancelActiveConversion(): void {
  if (ffmpegInstance) {
    try {
      ffmpegInstance.terminate();
    } catch {
      // Ignore terminate errors during cancellation.
    }
  }
  ffmpegInstance = null;
  isInitialized = false;
  isInitializing = false;
}

export interface EnvelopePoint {
  time: number;
  volume: number;
}

interface ConversionOptions {
  sampleRate?: number;
  bitDepth?: '16-bit' | 'dont-change';
  mono?: boolean;
  normalize?: boolean;
  trimStart?: boolean;
  format?: 'WAV' | 'dont-change';
  /** When true, shift pitch to C based on note in sourceFileName. Requires sourceFileName. */
  pitchToC?: boolean;
  sourceFileName?: string;
  /** Target BPM for tempo adjustment. Requires sourceTempo. */
  targetTempo?: number;
  /** Source BPM (detected from path). Requires targetTempo. */
  sourceTempo?: number;
  /** Region trim start (seconds). Applied before FFmpeg. */
  regionStart?: number;
  /** Region trim end (seconds). Applied before FFmpeg. */
  regionEnd?: number;
  /** Volume envelope points. Applied before FFmpeg. */
  envelopePoints?: EnvelopePoint[];
}

async function initializeFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance && isInitialized) {
    return ffmpegInstance;
  }

  if (isInitializing) {
    // Wait for initialization to complete
    while (isInitializing) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (ffmpegInstance && isInitialized) {
      return ffmpegInstance;
    }
  }

  isInitializing = true;

  try {
    const ffmpeg = new FFmpeg();
    
    // Load FFmpeg core
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm';
    
    await ffmpeg.load({
      coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    ffmpegInstance = ffmpeg;
    isInitialized = true;
    isInitializing = false;

    return ffmpeg;
  } catch (error) {
    isInitializing = false;
    throw error;
  }
}

/** Run ffmpeg.exec and return captured log output. */
async function execAndGetLogs(ffmpeg: FFmpeg, args: string[]): Promise<string> {
  const logs: string[] = [];
  const handler = ({ message }: { message: string }) => logs.push(message);
  ffmpeg.on('log', handler);
  try {
    await ffmpeg.exec(args);
    return logs.join('\n');
  } finally {
    ffmpeg.off('log', handler);
  }
}

async function probeSampleRate(ffmpeg: FFmpeg, inputName: string): Promise<number> {
  const probeOut = 'probe_null.tmp';
  try {
    const logText = await execAndGetLogs(ffmpeg, ['-i', inputName, '-t', '0.001', '-f', 'null', probeOut]);
    const match = logText.match(/Audio:.*?(\d+)\s*Hz/);
    await ffmpeg.deleteFile(probeOut).catch(() => {});
    return match ? parseInt(match[1], 10) : 44100;
  } catch {
    await ffmpeg.deleteFile(probeOut).catch(() => {});
    return 44100;
  }
}

async function detectSilenceStart(file: File, ffmpeg: FFmpeg): Promise<number> {
  try {
    const inputFileName = 'input.wav';
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));

    // Use silencedetect filter to find where silence ends
    const logText = await execAndGetLogs(ffmpeg, [
      '-i', inputFileName,
      '-af', 'silencedetect=noise=-30dB:d=0.3',
      '-f', 'null',
      '-'
    ]);

    // Parse the silencedetect output
    const silenceEndMatch = logText.match(/silence_end:\s*([\d.]+)/);
    if (silenceEndMatch?.[1]) {
      const silenceEnd = parseFloat(silenceEndMatch[1]);
      return Math.max(0, silenceEnd);
    }

    // Check for silence_start
    const silenceStartMatch = logText.match(/silence_start:\s*([\d.]+)/);
    if (silenceStartMatch?.[1]) {
      const silenceStart = parseFloat(silenceStartMatch[1]);
      if (silenceStart < 0.5) {
        const silenceEndMatch2 = logText.match(/silence_end:\s*([\d.]+)/);
        if (silenceEndMatch2?.[1]) {
          return Math.max(0, parseFloat(silenceEndMatch2[1]));
        }
      }
    }

    return 0;
  } catch (error) {
    console.error('Error detecting silence:', error);
    return 0;
  }
}

/** FFmpeg atempo accepts 0.5–2.0 per filter. Chain multiple for factors outside that range. */
function buildAtempoFilterChain(targetTempo: number, sourceTempo: number): string {
  const factor = targetTempo / sourceTempo;
  const factors: number[] = [];
  let remaining = factor;
  while (remaining > 2) {
    factors.push(2);
    remaining /= 2;
  }
  while (remaining < 0.5) {
    factors.push(0.5);
    remaining /= 0.5;
  }
  factors.push(remaining);
  return factors.map((f) => `atempo=${f}`).join(",");
}

export async function convertAudio(
  inputFile: File,
  options: ConversionOptions
): Promise<Blob> {
  return withConversionMutex(async () => {
  let fileToConvert = inputFile;

  // Pre-process with region trim and envelope if specified
  if (
    options.regionStart != null ||
    options.regionEnd != null ||
    (options.envelopePoints && options.envelopePoints.length > 0)
  ) {
    const { exportAudioWithEdits } = await import('./exportAudio');
    const { mainBlob } = await exportAudioWithEdits(
      inputFile,
      {
        regionStart: options.regionStart,
        regionEnd: options.regionEnd,
        envelopePoints: options.envelopePoints,
      },
      0
    );
    fileToConvert = new File([mainBlob], inputFile.name.replace(/\.[^.]+$/, '.wav') || 'input.wav', {
      type: 'audio/wav',
    });
  }

  const ffmpeg = await initializeFFmpeg();

  const inputFileName = 'input.wav';
  const outputFileName = 'output.wav';

  try {
    const fileData = await fetchFile(fileToConvert);
    const dataLength = fileData?.byteLength ?? 0;
    if (dataLength === 0) {
      throw new Error(
        `File "${fileToConvert?.name ?? "unknown"}" is empty or could not be read. ` +
          "Please ensure the file contains data and you have access to read it."
      );
    }
    // Write input file to FFmpeg virtual filesystem
    await ffmpeg.writeFile(inputFileName, fileData);

    // Detect silence at start if needed
    let silenceStartTime = 0;
    if (options.trimStart) {
      silenceStartTime = await detectSilenceStart(fileToConvert, ffmpeg);
      console.log(`Detected silence at start: ${silenceStartTime} seconds`);
    }

    // Pitch-to-C: analyze filename and compute varispeed ratio if needed
    let pitchRatio: number | null = null;
    if (options.pitchToC && options.sourceFileName) {
      const analysis = analyzeFilenameForNote(options.sourceFileName);
      if (analysis && analysis.semitonesDownToC !== 0) {
        pitchRatio = 1 / analysis.speedRatio;
      }
    }

    const targetSampleRate = options.sampleRate || 44100;

    // Build FFmpeg command
    const args: string[] = [];

    // If trimming start, use -ss to skip silence
    if (options.trimStart && silenceStartTime > 0) {
      args.push('-ss', silenceStartTime.toString());
    }

    args.push('-i', inputFileName);
    args.push('-y'); // Overwrite output file

    // Build audio filter chain
    const audioFilters: string[] = [];

    // Add atempo (tempo adjustment) first if needed
    if (options.targetTempo != null && options.sourceTempo != null) {
      audioFilters.push(buildAtempoFilterChain(options.targetTempo, options.sourceTempo));
    }

    // Add varispeed (pitch-to-C) if needed
    if (pitchRatio !== null) {
      const inputRate = await probeSampleRate(ffmpeg, inputFileName);
      audioFilters.push(`asetrate=${inputRate}*${pitchRatio},aresample=${targetSampleRate}`);
    }

    // Add normalization
    if (options.normalize) {
      audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    }

    // When we have filters and want a specific sample rate, add aresample to the filter chain.
    // Some filters (e.g. loudnorm) can change output sample rate; -ar alone may not reliably set it.
    if (options.sampleRate && pitchRatio === null && audioFilters.length > 0) {
      audioFilters.push(`aresample=${options.sampleRate}`);
    }

    // Add audio filters if any
    if (audioFilters.length > 0) {
      args.push('-af', audioFilters.join(','));
    }

    // Add sample rate conversion (only if not already set by varispeed)
    if (options.sampleRate && pitchRatio === null) {
      args.push('-ar', options.sampleRate.toString());
    } else if (pitchRatio !== null) {
      args.push('-ar', targetSampleRate.toString());
    }

    // Add mono conversion
    if (options.mono) {
      args.push('-ac', '1');
    }

    // Determine audio codec based on sample depth
    let audioCodec = 'pcm_s16le'; // Default to 16-bit
    if (options.bitDepth === '16-bit') {
      audioCodec = 'pcm_s16le';
    }

    // Output format - always WAV when we're converting (we output to output.wav)
    args.push('-f', 'wav');

    args.push('-acodec', audioCodec);
    args.push(outputFileName);

    // Execute conversion
    await ffmpeg.exec(args);

    // Read output file
    const data = await ffmpeg.readFile(outputFileName);

    // Clean up virtual files
    await ffmpeg.deleteFile(inputFileName);
    await ffmpeg.deleteFile(outputFileName);

    // Convert to Blob
    if (data instanceof Uint8Array) {
      return new Blob([data], { type: 'audio/wav' });
    } else {
      throw new Error('Unexpected output format from FFmpeg');
    }
  } catch (error) {
    // Reset FFmpeg instance on FS errors so next conversion gets a fresh virtual filesystem
    if ((error as Error)?.name === 'ErrnoError' || (error as Error)?.message?.includes('FS error')) {
      cancelActiveConversion();
    }
    // Clean up on error
    try {
      await ffmpeg.deleteFile(inputFileName);
      await ffmpeg.deleteFile(outputFileName);
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
  });
}

/** Extensions that browsers typically cannot decode natively (AIFF). */
const AIFF_EXT = /\.(aif|aiff)$/i;

/**
 * Ensures a blob URL points to audio the Web Audio API can decode.
 * Converts AIFF to WAV on-the-fly since browsers have limited AIFF support.
 * Returns the original URL if no conversion is needed.
 */
export async function ensureAudioDecodable(
  blobUrl: string,
  virtualPath: string
): Promise<string> {
  if (!AIFF_EXT.test(virtualPath)) {
    return blobUrl;
  }
  try {
    const res = await fetch(blobUrl);
    const blob = await res.blob();
    const fileName = virtualPath.split('/').pop() || 'audio.aif';
    const file = new File([blob], fileName, { type: blob.type || 'audio/aiff' });
    const wavBlob = await convertAudio(file, { format: 'WAV' });
    return URL.createObjectURL(wavBlob);
  } catch (error) {
    console.error('Failed to convert AIFF to WAV:', error);
    throw error;
  }
}

// Helper function to check if conversion is needed
export function needsConversion(options: ConversionOptions): boolean {
  return !!(
    options.sampleRate ||
    options.bitDepth === '16-bit' ||
    options.mono ||
    options.normalize ||
    options.format === 'WAV' ||
    options.trimStart ||
    options.pitchToC ||
    options.targetTempo ||
    options.sourceTempo ||
    options.regionStart != null ||
    options.regionEnd != null ||
    (options.envelopePoints && options.envelopePoints.length > 0)
  );
}
