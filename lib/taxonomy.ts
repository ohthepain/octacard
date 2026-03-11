/**
 * V1 Sound Classification Taxonomy
 *
 * Canonical term IDs only. Raw model strings are interpreted by a rule layer
 * and mapped to these IDs. Keeps localization and AI chat sane.
 */

export const TAXONOMY_ATTRIBUTES = [
  "instrument_family",
  "instrument_type",
  "style",
  "descriptor",
  "mood",
] as const;

export type TaxonomyAttributeKey = (typeof TAXONOMY_ATTRIBUTES)[number];

/** Canonical values per attribute. Key = canonical ID used in product/API. */
export const TAXONOMY_VALUES: Record<TaxonomyAttributeKey, readonly string[]> = {
  instrument_family: ["drum", "synth", "bass", "fx", "texture"],
  instrument_type: [
    "kick",
    "snare",
    "clap",
    "hat",
    "tom",
    "cymbal",
    "pad",
    "lead",
    "pluck",
    "stab",
    "bass",
    "riser",
  ],
  style: ["lofi", "techno", "house", "cinematic", "trap", "ambient"],
  descriptor: [
    "warm",
    "bright",
    "dark",
    "punchy",
    "dusty",
    "metallic",
    "distorted",
    "clean",
    "crunchy",
    "wide",
    "dry",
  ],
  mood: ["aggressive", "soft", "uplifting", "tense", "moody"],
};

/** All canonical value IDs for validation */
export const ALL_TAXONOMY_VALUES = new Set(
  TAXONOMY_ATTRIBUTES.flatMap((attr) => TAXONOMY_VALUES[attr])
);

export function isTaxonomyValue(value: string): value is string {
  return ALL_TAXONOMY_VALUES.has(value);
}

export function getTaxonomyValues(attr: TaxonomyAttributeKey): readonly string[] {
  return TAXONOMY_VALUES[attr];
}
