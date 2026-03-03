/**
 * Sample-accurate loop playback using Web Audio API.
 * Uses AudioBufferSourceNode.loop/loopStart/loopEnd for exact sample boundaries.
 */

export interface WebAudioLoopPlaybackOptions {
  audioUrl: string;
  loopStartSec: number;
  loopEndSec: number;
  playStartSec: number;
  playbackRate?: number;
  volume?: number;
  onTimeUpdate: (currentTimeSec: number) => void;
  onEnded: () => void;
}

export interface WebAudioLoopPlaybackHandle {
  stop: () => void;
}

/**
 * Start sample-accurate loop playback. Returns a handle to stop.
 */
export async function startWebAudioLoopPlayback(
  options: WebAudioLoopPlaybackOptions
): Promise<WebAudioLoopPlaybackHandle> {
  const {
    audioUrl,
    loopStartSec,
    loopEndSec,
    playStartSec,
    playbackRate = 1,
    volume = 1,
    onTimeUpdate,
    onEnded,
  } = options;

  const loopDuration = loopEndSec - loopStartSec;
  if (loopDuration <= 0) {
    throw new Error("Invalid loop region");
  }

  const res = await fetch(audioUrl);
  const arrayBuffer = await res.arrayBuffer();
  const ctx = new AudioContext();
  const buffer = await ctx.decodeAudioData(arrayBuffer);

  // Align to exact sample boundaries for sample-accurate looping
  const sr = buffer.sampleRate;
  const loopStartSample = Math.max(0, Math.floor(loopStartSec * sr));
  const loopEndSample = Math.max(loopStartSample + 1, Math.min(buffer.length, Math.ceil(loopEndSec * sr)));
  const playStartSample = Math.max(loopStartSample, Math.min(loopEndSample - 1, Math.floor(playStartSec * sr)));
  const loopStartExact = loopStartSample / sr;
  const loopEndExact = loopEndSample / sr;
  const playStartExact = playStartSample / sr;
  const loopDurationExact = loopEndExact - loopStartExact;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  source.loopStart = loopStartExact;
  source.loopEnd = loopEndExact;
  source.playbackRate.value = playbackRate;

  const gainNode = ctx.createGain();
  gainNode.gain.value = volume;
  source.connect(gainNode);
  gainNode.connect(ctx.destination);

  const startTime = ctx.currentTime;
  source.start(0, playStartExact);

  let rafId = 0;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    const elapsed = ctx.currentTime - startTime;
    // Position within loop: playStart + elapsed, wrapped
    const posInLoop = ((playStartExact - loopStartExact + elapsed) % loopDurationExact + loopDurationExact) % loopDurationExact;
    const currentTimeSec = loopStartExact + posInLoop;
    onTimeUpdate(currentTimeSec);
    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  let onEndedCalled = false;
  const callOnEnded = () => {
    if (onEndedCalled) return;
    onEndedCalled = true;
    onEnded();
  };

  source.onended = () => {
    stopped = true;
    cancelAnimationFrame(rafId);
    ctx.close();
    callOnEnded();
  };

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(rafId);
      try {
        source.stop();
      } catch {
        // Already stopped
      }
      source.onended = null;
      ctx.close();
      callOnEnded();
    },
  };
}
