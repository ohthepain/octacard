const TOKEN_SPLIT_PATTERN = /[\s._-]+/;
const TRAILING_SEPARATOR_PATTERN = /[_\-. ]+$/;
const NON_ALPHANUMERIC_PATTERN = /[^a-z0-9]+/gi;

export const FILENAME_ABBREVIATIONS: Record<string, string> = {
  acoustic: "ac",
  alternate: "alt",
  ambience: "amb",
  background: "bg",
  clean: "cln",
  compression: "comp",
  distorted: "dist",
  drum: "drm",
  effect: "fx",
  instrumental: "inst",
  karaoke: "krk",
  melody: "mel",
  microphone: "mic",
  original: "orig",
  percussion: "perc",
  processed: "proc",
  recording: "rec",
  reverb: "rvb",
  sample: "smp",
  sequence: "seq",
  single: "sgl",
  stereo: "st",
  take: "tk",
  version: "v",
  vocal: "vox",
};

export interface FilenameShortenerInput {
  folderName: string;
  filenames: string[];
  maxLength: number;
}

export interface ShortenFilenameInput {
  folderName: string;
  filename: string;
  maxLength: number;
}

interface SplitFilename {
  basename: string;
  extension: string;
}

export function shortenFilename({ folderName, filename, maxLength }: ShortenFilenameInput): string {
  return shortenFilenames({ folderName, filenames: [filename], maxLength })[filename] ?? filename;
}

export function shortenFilenames({ folderName, filenames, maxLength }: FilenameShortenerInput): Record<string, string> {
  const result: Record<string, string> = {};
  if (maxLength <= 0) {
    for (const filename of filenames) {
      result[filename] = filename;
    }
    return result;
  }

  const folderTokens = new Set(tokenize(folderName).map(normalizeToken).filter(Boolean));
  const usedNames = new Set<string>();

  for (const filename of filenames) {
    const split = splitFilename(filename);
    const baseBudget = Math.max(0, maxLength - split.extension.length);
    const baseTokens = tokenize(split.basename);
    const reducedTokens = reduceRedundantTokens(baseTokens, folderTokens);
    const compressedTokens = reducedTokens.map((token) => abbreviateToken(token));
    const compactBase = fitLeadingTokens(compressedTokens, split.basename, baseBudget);

    let candidate = `${compactBase}${split.extension}`;
    if (candidate.length > maxLength) {
      candidate = `${fitRawBase(compactBase, baseBudget)}${split.extension}`;
    }

    let suffixIndex = 1;
    while (usedNames.has(candidate)) {
      suffixIndex += 1;
      candidate = withNumericSuffix(compactBase, split.extension, maxLength, suffixIndex);
    }

    usedNames.add(candidate);
    result[filename] = candidate;
  }

  return result;
}

function splitFilename(filename: string): SplitFilename {
  const lastDotIndex = filename.lastIndexOf(".");
  if (lastDotIndex <= 0 || lastDotIndex === filename.length - 1) {
    return { basename: filename, extension: "" };
  }

  return {
    basename: filename.slice(0, lastDotIndex),
    extension: filename.slice(lastDotIndex),
  };
}

function tokenize(value: string): string[] {
  return value
    .split(TOKEN_SPLIT_PATTERN)
    .map((token) => token.trim())
    .filter(Boolean);
}

function normalizeToken(token: string): string {
  return token.toLowerCase().replace(NON_ALPHANUMERIC_PATTERN, "");
}

function reduceRedundantTokens(tokens: string[], folderTokens: Set<string>): string[] {
  const seen = new Set<string>();
  const reduced: string[] = [];

  for (const token of tokens) {
    const normalized = normalizeToken(token);
    if (!normalized) {
      continue;
    }
    if (folderTokens.has(normalized)) {
      continue;
    }
    if (seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    reduced.push(token);
  }

  return reduced;
}

function abbreviateToken(token: string): string {
  const normalized = normalizeToken(token);
  if (!normalized) {
    return token;
  }
  return FILENAME_ABBREVIATIONS[normalized] ?? token;
}

function fitLeadingTokens(tokens: string[], fallbackBasename: string, budget: number): string {
  if (budget <= 0) {
    return "";
  }

  const filteredTokens = tokens.filter(Boolean);
  if (filteredTokens.length === 0) {
    return fitRawBase(fallbackBasename, budget);
  }

  let active = [...filteredTokens];
  let joined = active.join("_");
  while (active.length > 1 && joined.length > budget) {
    active.pop();
    joined = active.join("_");
  }

  if (joined.length <= budget) {
    return joined;
  }

  return fitRawBase(joined, budget);
}

function fitRawBase(value: string, budget: number): string {
  if (budget <= 0) {
    return "";
  }
  if (value.length <= budget) {
    return value;
  }

  const sliced = value.slice(0, budget).replace(TRAILING_SEPARATOR_PATTERN, "");
  return sliced.length > 0 ? sliced : value.slice(0, budget);
}

function withNumericSuffix(base: string, extension: string, maxLength: number, suffixIndex: number): string {
  const suffix = `_${suffixIndex}`;
  const baseBudget = Math.max(0, maxLength - extension.length - suffix.length);
  const fittedBase = fitRawBase(base, baseBudget);
  return `${fittedBase}${suffix}${extension}`;
}
