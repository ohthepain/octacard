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
    const disambiguationSource = compressedTokens.join("_") || split.basename;
    const disambiguationTokens = getDisambiguationTokens(disambiguationSource, compactBase);

    let candidate = `${compactBase}${split.extension}`;
    if (candidate.length > maxLength) {
      candidate = `${fitRawBase(compactBase, baseBudget)}${split.extension}`;
    }

    if (usedNames.has(candidate)) {
      for (let tokenCount = 1; tokenCount <= disambiguationTokens.length; tokenCount += 1) {
        const disambiguatedBase = withTrailingDisambiguator({
          base: compactBase,
          disambiguationTokens,
          tokenCount,
          maxLength: baseBudget,
        });
        if (!disambiguatedBase) {
          continue;
        }
        const disambiguatedCandidate = `${disambiguatedBase}${split.extension}`;
        if (!usedNames.has(disambiguatedCandidate)) {
          candidate = disambiguatedCandidate;
          break;
        }
      }
    }

    const numericCollisionBase = getNumericFallbackBase(compactBase, split.extension, maxLength);
    let suffixIndex = 1;
    while (usedNames.has(candidate)) {
      suffixIndex += 1;
      candidate = withNumericSuffix(numericCollisionBase, split.extension, maxLength, suffixIndex);
    }

    usedNames.add(candidate);
    result[filename] = candidate;
  }

  return result;
}

function getDisambiguationTokens(sourceBasename: string, compactBase: string): string[] {
  const sourceTokens = tokenize(sourceBasename);
  const compactTokens = tokenize(compactBase);
  if (sourceTokens.length === 0 || compactTokens.length === 0) {
    return sourceTokens;
  }

  const abbreviatedSourceTokens = sourceTokens.map((token) => abbreviateToken(token));
  const equivalentToCompact =
    abbreviatedSourceTokens.length === compactTokens.length &&
    abbreviatedSourceTokens.every(
      (token, idx) => normalizeToken(token) === normalizeToken(compactTokens[idx] ?? ""),
    );
  if (equivalentToCompact) {
    return [];
  }

  let prefixMatches = 0;
  while (
    prefixMatches < sourceTokens.length &&
    prefixMatches < compactTokens.length &&
    normalizeToken(sourceTokens[prefixMatches]) === normalizeToken(compactTokens[prefixMatches])
  ) {
    prefixMatches += 1;
  }

  const remaining = sourceTokens.slice(prefixMatches).map((token) => abbreviateToken(token));
  return remaining.filter(Boolean);
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
    if (active.length === 1 && filteredTokens.length >= 2) {
      const firstAndLast = `${filteredTokens[0]}_${filteredTokens[filteredTokens.length - 1]}`;
      if (firstAndLast.length <= budget) {
        return firstAndLast;
      }
    }
    return joined;
  }

  if (filteredTokens.length >= 2) {
    const firstAndLast = `${filteredTokens[0]}_${filteredTokens[filteredTokens.length - 1]}`;
    if (firstAndLast.length <= budget) {
      return firstAndLast;
    }
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

function withTrailingDisambiguator({
  base,
  disambiguationTokens,
  tokenCount,
  maxLength,
}: {
  base: string;
  disambiguationTokens: string[];
  tokenCount: number;
  maxLength: number;
}): string | null {
  if (maxLength <= 0 || tokenCount <= 0 || disambiguationTokens.length === 0) {
    return null;
  }

  const tail = disambiguationTokens.slice(-tokenCount).join("_");
  if (!tail) {
    return null;
  }

  const suffix = `_${tail}`;
  const baseBudget = Math.max(0, maxLength - suffix.length);
  if (baseBudget <= 0 || baseBudget < base.length) {
    return null;
  }

  return `${fitRawBase(base, baseBudget)}${suffix}`;
}

function getNumericFallbackBase(base: string, extension: string, maxLength: number): string {
  const minSuffixLength = "_2".length;
  if (base.length + extension.length + minSuffixLength <= maxLength) {
    return base;
  }

  const tokens = tokenize(base);
  return tokens[0] ?? base;
}

function withNumericSuffix(base: string, extension: string, maxLength: number, suffixIndex: number): string {
  const suffix = `_${suffixIndex}`;
  const baseBudget = Math.max(0, maxLength - extension.length - suffix.length);
  const fittedBase = fitRawBase(base, baseBudget);
  return `${fittedBase}${suffix}${extension}`;
}
