const BPM_MIN = 50;
const BPM_MAX = 240;

/** BPM regex patterns in order of precedence (first match wins) */
const BPM_PATTERNS: Array<{ regex: RegExp; group: number }> = [
  { regex: /^(\d{2,3})/, group: 1 }, // number at start
  { regex: /_(\d{2,3})/, group: 1 }, // preceded by underscore
  { regex: /(\d{2,3})(?:_?bpm)/i, group: 1 }, // directly followed by bpm or _bpm
  { regex: /_(\d{2,3})(?:\.\w+)?$/, group: 1 }, // at end before extension
];

function isValidBpm(n: number): boolean {
  return Number.isFinite(n) && n >= BPM_MIN && n <= BPM_MAX;
}

/**
 * Extract BPM from a string (filename or folder name) using supported patterns.
 * Returns null if no valid BPM (50–240) is found.
 */
export function parseBpmFromString(
  str: string
): { bpm: number; source: "filename" | "folder" } | null {
  for (const { regex, group } of BPM_PATTERNS) {
    const match = str.match(regex);
    if (match) {
      const bpm = parseInt(match[group], 10);
      if (isValidBpm(bpm)) {
        return { bpm, source: "filename" };
      }
    }
  }
  return null;
}

/**
 * Replace the matched BPM in a string with a new value.
 * Uses the same patterns as parseBpmFromString; replaces the first match.
 */
export function replaceBpmInString(
  str: string,
  oldBpm: number,
  newBpm: number
): string {
  const newBpmStr = String(newBpm);
  for (const { regex, group } of BPM_PATTERNS) {
    const match = str.match(regex);
    if (match) {
      const parsed = parseInt(match[group], 10);
      if (parsed === oldBpm) {
        const before = str.slice(0, match.index!);
        const matched = match[0];
        const after = str.slice(match.index! + matched.length);
        // Replace the captured group within the matched substring
        const replaced = matched.replace(match[group], newBpmStr);
        return before + replaced + after;
      }
    }
  }
  return str;
}
