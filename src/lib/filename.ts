const COMBINING_MARKS_PATTERN = /\p{M}+/gu;
const INVALID_FILENAME_CHAR_PATTERN = /[^a-zA-Z0-9_!&()+,\-.=@[\]{} ]/g;

/** Path separators, control chars, null, and Windows-reserved chars. Preserves Unicode letters (å, ä, ö, etc.). */
const DANGEROUS_FILENAME_CHARS = /[\x00-\x1F\x7F/\\:*?"<>|]+/g;

/**
 * Minimal security sanitization: strips only dangerous characters (path separators,
 * control chars, Windows-reserved). Preserves Swedish characters, emoji, and other Unicode.
 */
export function sanitizeFilenameMinimal(filename: string): string {
  return filename.replace(DANGEROUS_FILENAME_CHARS, "_");
}

/**
 * Strict sanitization for device compatibility (e.g. SP-404): transliterates to ASCII,
 * strips combining marks, replaces non-ASCII and special chars. Use when target device
 * requires simple filenames.
 */
export function sanitizeFilename(filename: string): string {
  const transliterated = filename.normalize("NFKD").replace(COMBINING_MARKS_PATTERN, "");
  return transliterated.replace(INVALID_FILENAME_CHAR_PATTERN, "_");
}
