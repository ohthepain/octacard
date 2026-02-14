import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpegInstance: FFmpeg | null = null;
let isInitialized = false;
let isInitializing = false;

interface ConversionOptions {
  sampleRate?: number;
  bitDepth?: '16-bit' | 'dont-change';
  mono?: boolean;
  normalize?: boolean;
  trimStart?: boolean;
  format?: 'WAV' | 'dont-change';
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
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    
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

async function detectSilenceStart(file: File, ffmpeg: FFmpeg): Promise<number> {
  try {
    const inputFileName = 'input.wav';
    await ffmpeg.writeFile(inputFileName, await fetchFile(file));

    // Use silencedetect filter to find where silence ends
    await ffmpeg.exec([
      '-i', inputFileName,
      '-af', 'silencedetect=noise=-30dB:d=0.3',
      '-f', 'null',
      '-'
    ]);

    const logs = ffmpeg.exec.getLogs();
    const logText = logs.map(log => log.message).join('\n');

    // Parse the silencedetect output
    const silenceEndMatch = logText.match(/silence_end:\s*([\d.]+)/);
    if (silenceEndMatch && silenceEndMatch[1]) {
      const silenceEnd = parseFloat(silenceEndMatch[1]);
      return Math.max(0, silenceEnd);
    }

    // Check for silence_start
    const silenceStartMatch = logText.match(/silence_start:\s*([\d.]+)/);
    if (silenceStartMatch && silenceStartMatch[1]) {
      const silenceStart = parseFloat(silenceStartMatch[1]);
      if (silenceStart < 0.5) {
        const silenceEndMatch2 = logText.match(/silence_end:\s*([\d.]+)/);
        if (silenceEndMatch2 && silenceEndMatch2[1]) {
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

export async function convertAudio(
  inputFile: File,
  options: ConversionOptions
): Promise<Blob> {
  const ffmpeg = await initializeFFmpeg();

  const inputFileName = 'input.wav';
  const outputFileName = 'output.wav';

  try {
    // Write input file to FFmpeg virtual filesystem
    await ffmpeg.writeFile(inputFileName, await fetchFile(inputFile));

    // Detect silence at start if needed
    let silenceStartTime = 0;
    if (options.trimStart) {
      silenceStartTime = await detectSilenceStart(inputFile, ffmpeg);
      console.log(`Detected silence at start: ${silenceStartTime} seconds`);
    }

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

    // Add normalization
    if (options.normalize) {
      audioFilters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    }

    // Add audio filters if any
    if (audioFilters.length > 0) {
      args.push('-af', audioFilters.join(','));
    }

    // Add sample rate conversion
    if (options.sampleRate) {
      args.push('-ar', options.sampleRate.toString());
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

    // Output format
    if (options.format === 'WAV') {
      args.push('-f', 'wav');
    }

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
    // Clean up on error
    try {
      await ffmpeg.deleteFile(inputFileName);
      await ffmpeg.deleteFile(outputFileName);
    } catch {
      // Ignore cleanup errors
    }
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
    options.trimStart
  );
}
