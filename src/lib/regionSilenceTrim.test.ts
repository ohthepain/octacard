import { describe, expect, it } from "vitest";
import { trimSilenceInRegion } from "@/lib/regionSilenceTrim";

function createTestAudioBuffer(
  sampleRate: number,
  channels: Float32Array[],
): AudioBuffer {
  const length = channels[0]?.length ?? 0;
  return {
    duration: length / sampleRate,
    sampleRate,
    length,
    numberOfChannels: channels.length,
    getChannelData: (ch: number) => {
      const data = channels[ch];
      if (!data) throw new Error(`Missing channel ${ch}`);
      return data;
    },
  } as unknown as AudioBuffer;
}

describe("trimSilenceInRegion", () => {
  it("trims both leading and trailing silence", () => {
    const sampleRate = 1_000;
    const data = new Float32Array(1_000);
    for (let i = 200; i < 700; i++) data[i] = 0.5;
    const buffer = createTestAudioBuffer(sampleRate, [data]);

    const trimmed = trimSilenceInRegion(buffer, 0, 1);

    expect(trimmed.trimmedStart).toBe(true);
    expect(trimmed.trimmedEnd).toBe(true);
    expect(trimmed.start).toBeCloseTo(0.2, 3);
    expect(trimmed.end).toBeCloseTo(0.7, 3);
  });

  it("keeps bounds when region already starts/ends with content", () => {
    const sampleRate = 1_000;
    const data = new Float32Array(1_000);
    data.fill(0.35);
    const buffer = createTestAudioBuffer(sampleRate, [data]);

    const trimmed = trimSilenceInRegion(buffer, 0, 1);

    expect(trimmed.trimmedStart).toBe(false);
    expect(trimmed.trimmedEnd).toBe(false);
    expect(trimmed.start).toBeCloseTo(0, 6);
    expect(trimmed.end).toBeCloseTo(1, 6);
  });

  it("detects signal in any channel", () => {
    const sampleRate = 1_000;
    const left = new Float32Array(1_000);
    const right = new Float32Array(1_000);
    for (let i = 120; i < 880; i++) right[i] = 0.25;
    const buffer = createTestAudioBuffer(sampleRate, [left, right]);

    const trimmed = trimSilenceInRegion(buffer, 0, 1);

    expect(trimmed.trimmedStart).toBe(true);
    expect(trimmed.trimmedEnd).toBe(true);
    expect(trimmed.start).toBeCloseTo(0.12, 3);
    expect(trimmed.end).toBeCloseTo(0.88, 3);
  });

  it("keeps bounds for fully silent region", () => {
    const sampleRate = 1_000;
    const data = new Float32Array(1_000);
    const buffer = createTestAudioBuffer(sampleRate, [data]);

    const trimmed = trimSilenceInRegion(buffer, 0.1, 0.9);

    expect(trimmed.trimmedStart).toBe(false);
    expect(trimmed.trimmedEnd).toBe(false);
    expect(trimmed.start).toBeCloseTo(0.1, 6);
    expect(trimmed.end).toBeCloseTo(0.9, 6);
  });
});
