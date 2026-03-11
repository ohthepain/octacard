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
  instrument_family: [
    "drums",
    "percussion",
    "bass",
    "synth",
    "keys",
    "guitar",
    "strings",
    "brass",
    "woodwinds",
    "vocals",
    "fx",
    "texture_atmosphere",
  ],
  instrument_type: [
    "kick",
    "snare",
    "clap",
    "hi_hat",
    "tom",
    "cymbal",
    "rimshot",
    "drum_fill",
    "drum_loop",
    "shaker",
    "tambourine",
    "bongo",
    "conga",
    "clave",
    "cowbell",
    "triangle",
    "percussion_loop",
    "piano",
    "electric_piano",
    "organ",
    "harpsichord",
    "clavinet",
    "bass",
    "pad",
    "lead",
    "pluck",
    "arp",
    "chord",
    "drone",
    "electric_bass",
    "upright_bass",
    "synth_bass",
    "sub_bass",
    "electric_guitar",
    "acoustic_guitar",
    "muted_guitar",
    "guitar_harmonics",
    "vocal_one_shot",
    "vocal_phrase",
    "choir",
    "chant",
    "impact",
    "riser",
    "downlifter",
    "hit",
    "sweep",
    "noise",
    "glitch",
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

export const INSTRUMENT_FAMILY_TYPE_MAP: Record<string, readonly string[]> = {
  drums: ["kick", "snare", "clap", "hi_hat", "tom", "cymbal", "rimshot", "drum_fill", "drum_loop"],
  percussion: ["shaker", "tambourine", "bongo", "conga", "clave", "cowbell", "triangle", "percussion_loop"],
  keys: ["piano", "electric_piano", "organ", "harpsichord", "clavinet"],
  synth: ["bass", "lead", "pad", "pluck", "arp", "chord", "drone"],
  bass: ["electric_bass", "upright_bass", "synth_bass", "sub_bass"],
  guitar: ["electric_guitar", "acoustic_guitar", "muted_guitar", "guitar_harmonics"],
  vocals: ["vocal_one_shot", "vocal_phrase", "choir", "chant"],
  fx: ["impact", "riser", "downlifter", "hit", "sweep", "noise", "glitch"],
};
