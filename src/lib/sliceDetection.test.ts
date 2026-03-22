import { describe, expect, it } from "vitest";
import {
  computeTransientScores,
  confidenceThresholdForMinCount,
  debounceSliceMarkers,
  formatSliceConfidenceChip,
  inferSliceCountFromConfidences,
  selectSlicesByConfidenceThreshold,
  selectTopNSlicesWithMeta,
} from "@/lib/sliceDetection";

describe("inferSliceCountFromConfidences", () => {
  it("returns empty defaults for no markers", () => {
    const r = inferSliceCountFromConfidences([]);
    expect(r.numSlices).toBe(1);
    expect(r.threshold).toBe(0);
    expect(r.method).toBe("empty");
  });

  it("handles single marker", () => {
    const r = inferSliceCountFromConfidences([{ time: 0, confidence: 0.8 }]);
    expect(r.numSlices).toBe(1);
    expect(r.threshold).toBe(0.8);
    expect(r.method).toBe("single");
  });

  it("picks elbow at largest confidence gap", () => {
    const markers = [
      { time: 0, confidence: 0.95 },
      { time: 1, confidence: 0.92 },
      { time: 2, confidence: 0.88 },
      { time: 3, confidence: 0.2 },
      { time: 4, confidence: 0.15 },
    ];
    const r = inferSliceCountFromConfidences(markers);
    expect(r.method).toBe("confidence_elbow");
    expect(r.numSlices).toBe(3);
    expect(r.threshold).toBe(0.88);
  });

  it("uses median fallback when gaps are flat", () => {
    const markers = [
      { time: 0, confidence: 0.51 },
      { time: 1, confidence: 0.5 },
      { time: 2, confidence: 0.49 },
      { time: 3, confidence: 0.48 },
    ];
    const r = inferSliceCountFromConfidences(markers);
    expect(r.method).toBe("median_fallback");
    expect(r.numSlices).toBeGreaterThanOrEqual(1);
  });
});

describe("selectSlicesByConfidenceThreshold", () => {
  it("keeps all markers at or above threshold, time-ordered", () => {
    const markers = [
      { time: 0.5, confidence: 0.9 },
      { time: 0.1, confidence: 0.3 },
      { time: 0.3, confidence: 0.6 },
    ];
    const out = selectSlicesByConfidenceThreshold(markers, 0.5);
    expect(out.map((m) => m.time)).toEqual([0.3, 0.5]);
  });
});

describe("confidenceThresholdForMinCount", () => {
  it("returns Nth largest confidence", () => {
    const markers = [
      { time: 0, confidence: 0.9 },
      { time: 1, confidence: 0.5 },
      { time: 2, confidence: 0.7 },
    ];
    expect(confidenceThresholdForMinCount(markers, 1)).toBe(0.9);
    expect(confidenceThresholdForMinCount(markers, 2)).toBe(0.7);
    expect(confidenceThresholdForMinCount(markers, 3)).toBe(0.5);
  });
});

describe("formatSliceConfidenceChip", () => {
  it("shows extra decimals for zero and tiny values", () => {
    expect(formatSliceConfidenceChip(0)).toBe("0.0000");
    expect(formatSliceConfidenceChip(0.003)).toBe("0.0030");
    expect(formatSliceConfidenceChip(0.05)).toBe("0.050");
    expect(formatSliceConfidenceChip(0.2)).toBe("0.20");
  });
});

describe("selectTopNSlicesWithMeta", () => {
  it("returns next candidate when more markers exist below top N", () => {
    const markers = [
      { time: 0, confidence: 0.9 },
      { time: 1, confidence: 0.5 },
      { time: 2, confidence: 0.7 },
    ];
    const r = selectTopNSlicesWithMeta(markers, 2);
    expect(r.selected.map((m) => m.time)).toEqual([0, 2]);
    expect(r.weakestKept).toBe(0.7);
    expect(r.nextCandidateConfidence).toBe(0.5);
  });

  it("reports null next when N equals marker count", () => {
    const markers = [
      { time: 0, confidence: 0 },
      { time: 1, confidence: 0 },
    ];
    const r = selectTopNSlicesWithMeta(markers, 2);
    expect(r.selected).toHaveLength(2);
    expect(r.weakestKept).toBe(0);
    expect(r.nextCandidateConfidence).toBeNull();
  });

  it("breaks confidence ties by earlier time", () => {
    const markers = [
      { time: 0.2, confidence: 0.5 },
      { time: 0.1, confidence: 0.5 },
    ];
    const r = selectTopNSlicesWithMeta(markers, 1);
    expect(r.selected[0]?.time).toBe(0.1);
    expect(r.nextCandidateConfidence).toBe(0.5);
  });
});

function maxTransientScoreBetween(
  frames: { time: number; score: number }[],
  t0: number,
  t1: number,
): number {
  let m = 0;
  for (const f of frames) {
    if (f.time >= t0 && f.time <= t1) m = Math.max(m, f.score);
  }
  return m;
}

describe("debounceSliceMarkers", () => {
  it("drops the weaker of two hits within min spacing (time-ordered)", () => {
    const out = debounceSliceMarkers(
      [
        { time: 0.1, confidence: 0.3 },
        { time: 0.11, confidence: 0.9 },
      ],
      0.05,
    );
    expect(out).toEqual([{ time: 0.11, confidence: 0.9 }]);
  });

  it("keeps the first when the later hit is weaker", () => {
    const out = debounceSliceMarkers(
      [
        { time: 0.1, confidence: 0.8 },
        { time: 0.11, confidence: 0.2 },
      ],
      0.05,
    );
    expect(out).toEqual([{ time: 0.1, confidence: 0.8 }]);
  });

  it("keeps both when separated", () => {
    const out = debounceSliceMarkers(
      [
        { time: 0.1, confidence: 0.5 },
        { time: 0.2, confidence: 0.5 },
      ],
      0.05,
    );
    expect(out.map((m) => m.time)).toEqual([0.1, 0.2]);
  });
});

describe("computeTransientScores", () => {
  const sampleRate = 48_000;
  /** ~2 s: step from quiet / silence to loud block (same attack, different pre-level). */
  function buildStepBuffer(
    preLevel: number,
    splitSample: number,
  ): Float32Array {
    const n = sampleRate * 2;
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      buf[i] = i < splitSample ? preLevel : 0.35;
    }
    return buf;
  }

  it("does not crush onsets after low pre-level noise vs true silence (similar attack)", () => {
    const split = Math.floor(sampleRate * 1.0);
    const silent = buildStepBuffer(0, split);
    const withNoise = buildStepBuffer(0.02, split);

    const a = computeTransientScores(silent, sampleRate);
    const b = computeTransientScores(withNoise, sampleRate);

    const t0 = split / sampleRate - 0.06;
    const t1 = split / sampleRate + 0.08;
    const scoreSilent = maxTransientScoreBetween(a, t0, t1);
    const scoreNoise = maxTransientScoreBetween(b, t0, t1);

    expect(scoreSilent).toBeGreaterThan(0.2);
    expect(scoreNoise).toBeGreaterThan(0.2);
    // Old linear-onset + global-max norm made this ratio enormous (~30+).
    expect(scoreSilent / Math.max(scoreNoise, 1e-6)).toBeLessThan(6);
  });
});
