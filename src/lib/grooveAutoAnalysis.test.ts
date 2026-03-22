import { describe, expect, it } from "vitest";
import { analyzeGrooveAuto } from "@/lib/grooveAutoAnalysis";

function createTestAudioBuffer(
  sampleRate: number,
  data: Float32Array,
): AudioBuffer {
  return {
    duration: data.length / sampleRate,
    sampleRate,
    length: data.length,
    numberOfChannels: 1,
    getChannelData: (ch: number) => {
      if (ch !== 0) throw new Error("only mono");
      return data;
    },
  } as unknown as AudioBuffer;
}

describe("analyzeGrooveAuto loop start", () => {
  it("does not force loopStart=0 when the first ~80ms is quiet vs the file peak", () => {
    const sampleRate = 48_000;
    const quietSec = 1.5;
    const loudSec = 1.0;
    const n = Math.floor(sampleRate * (quietSec + loudSec));
    const data = new Float32Array(n);
    const split = Math.floor(sampleRate * quietSec);
    for (let i = 0; i < split; i++) {
      data[i] = (Math.random() - 0.5) * 2e-4;
    }
    for (let i = split; i < n; i++) {
      data[i] = 0.45;
    }

    const buffer = createTestAudioBuffer(sampleRate, data);
    const r = analyzeGrooveAuto(buffer, { beatsPerBar: 4, beatUnit: 4 });

    expect(r.loopStart).toBeGreaterThan(0.05);
  });

  it("does not force loopStart=0 when the head is low-level noise below peak (not true silence)", () => {
    const sampleRate = 48_000;
    const padMs = 100;
    const padSamples = Math.floor((padMs / 1000) * sampleRate);
    const bodySamples = sampleRate * 2;
    const n = padSamples + bodySamples;
    const data = new Float32Array(n);
    for (let i = 0; i < padSamples; i++) {
      data[i] = 0.004;
    }
    data.fill(0.52, padSamples);
    const buffer = createTestAudioBuffer(sampleRate, data);
    const r = analyzeGrooveAuto(buffer, { beatsPerBar: 4, beatUnit: 4 });
    expect(r.loopStart).toBeGreaterThan(padMs / 1000 - 0.03);
  });

  it("does not force loopStart=0 when the file opens with padded digital silence", () => {
    const sampleRate = 48_000;
    const padMs = 120;
    const padSamples = Math.floor((padMs / 1000) * sampleRate);
    const bodySamples = sampleRate * 2;
    const n = padSamples + bodySamples;
    const data = new Float32Array(n);
    data.fill(0.48, padSamples);
    const buffer = createTestAudioBuffer(sampleRate, data);
    const r = analyzeGrooveAuto(buffer, { beatsPerBar: 4, beatUnit: 4 });
    expect(r.loopStart).toBeGreaterThan(padMs / 1000 - 0.02);
  });

  it("keeps loopStart near 0 when the file is loud from the first samples", () => {
    const sampleRate = 48_000;
    const n = sampleRate * 2;
    const data = new Float32Array(n);
    data.fill(0.42);

    const buffer = createTestAudioBuffer(sampleRate, data);
    const r = analyzeGrooveAuto(buffer, { beatsPerBar: 4, beatUnit: 4 });

    expect(r.loopStart).toBeLessThan(0.03);
  });
});
