// src/lib/batch-math.ts
// Musical note and BPM logic for batch audio processing (ported from Python scripts)

// --- Musical Note Definitions (Ported from Script 1) ---
export const NOTE_MAP: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
};

export interface NoteMatch {
  note: string;
  originalString: string;
  semitonesDownToC: number;
  speedRatio: number;
}

export function analyzeFilenameForNote(filename: string): NoteMatch | null {
  // Regex ported from Python: Look for Note (Group 1) optionally followed by quality (Group 2)
  const pattern = /(?<![A-Za-z#b])([A-G][#b]?)(m|min|maj|dim|sus)?(?![A-Za-z#b])/gi;
  const matches = Array.from(filename.matchAll(pattern));

  if (!matches || matches.length === 0) return null;

  const lastMatch = matches[matches.length - 1];
  const originalNoteStr = lastMatch[1];
  const upperNote = originalNoteStr.toUpperCase();

  const foundKey = Object.keys(NOTE_MAP).find((k) => k.toUpperCase() === upperNote);
  if (!foundKey) return null;

  const semitonesDown = NOTE_MAP[foundKey];
  const speedRatio = 2 ** (semitonesDown / 12.0);

  return {
    note: foundKey,
    originalString: lastMatch[0],
    semitonesDownToC: semitonesDown,
    speedRatio,
  };
}

// --- BPM Logic (Ported from Script 2) ---
export function calculateBpmRatio(originalBpm: number, targetBpm: number): number {
  if (originalBpm === 0) return 1;
  return targetBpm / originalBpm;
}
