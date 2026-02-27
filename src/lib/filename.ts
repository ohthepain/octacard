const COMBINING_MARKS_PATTERN = /\p{M}+/gu;
const INVALID_FILENAME_CHAR_PATTERN = /[^a-zA-Z0-9_!&()+,\-.=@[\]{} ]/g;

export function sanitizeFilename(filename: string): string {
  const transliterated = filename.normalize("NFKD").replace(COMBINING_MARKS_PATTERN, "");
  return transliterated.replace(INVALID_FILENAME_CHAR_PATTERN, "_");
}
