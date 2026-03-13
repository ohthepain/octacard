/**
 * Shared utilities for Essentia and CLAP analysis workers.
 */

import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import ffmpegPath from "ffmpeg-static";
import { prisma } from "../db.js";

const require = createRequire(import.meta.url);

export const TAXONOMY_CACHE_TTL_MS = 30_000;
export const INSTRUMENT_FAMILY_KEY = "instrument_family";
export const INSTRUMENT_TYPE_KEY = "instrument_type";

export type TaxonomyCategory = {
  attributeKey: string;
  values: Array<{ id: string; key: string; prompt: string }>;
};

export type EssentiaInstrumentGuess = {
  familyKey: string | null;
  typeKey: string | null;
  confidence: number;
};

export type EssentiaFeatureOutput = {
  attrs: Array<{ key: string; value: number }>;
  metrics: {
    bpm: number | null;
    pitch: number | null;
    pitchConfidence: number;
    spectralCentroidHz: number | null;
    zeroCrossingRate: number | null;
  };
};

let taxonomyCache: {
  loadedAt: number;
  categories: TaxonomyCategory[];
} | null = null;
let familyTypeMapCache: {
  loadedAt: number;
  map: Map<string, string[]>;
} | null = null;

export function buildTaxonomyPrompt(attributeKey: string, valueKey: string): string {
  const value = valueKey.replace(/[_-]+/g, " ").trim();
  switch (attributeKey) {
    case "instrument_family":
      return `${value} instrument`;
    case "instrument_type":
      return `${value} sound`;
    case "style":
      return `${value} style`;
    case "descriptor":
      return `${value} timbre`;
    case "mood":
      return `${value} mood`;
    default:
      return value;
  }
}

export async function loadInstrumentFamilyTypeMapFromDb(): Promise<
  Map<string, string[]>
> {
  const now = Date.now();
  if (
    familyTypeMapCache &&
    now - familyTypeMapCache.loadedAt < TAXONOMY_CACHE_TTL_MS
  ) {
    return familyTypeMapCache.map;
  }

  const rows = await prisma.$queryRaw<
    Array<{ familyKey: string; typeKey: string; sortOrder: number }>
  >`
    SELECT f.key AS "familyKey", t.key AS "typeKey", l."sortOrder" AS "sortOrder"
    FROM "taxonomy_family_type" l
    JOIN "taxonomy_value" f ON f.id = l."familyValueId"
    JOIN "taxonomy_value" t ON t.id = l."typeValueId"
    JOIN "taxonomy_attribute" fa ON fa.id = f."attributeId"
    JOIN "taxonomy_attribute" ta ON ta.id = t."attributeId"
    WHERE fa.key = ${INSTRUMENT_FAMILY_KEY}
      AND ta.key = ${INSTRUMENT_TYPE_KEY}
    ORDER BY f.key ASC, l."sortOrder" ASC, t.key ASC
  `;

  const map = new Map<string, string[]>();
  for (const row of rows) {
    const list = map.get(row.familyKey) ?? [];
    list.push(row.typeKey);
    map.set(row.familyKey, list);
  }

  familyTypeMapCache = { loadedAt: now, map };
  return map;
}

function pickFirstAvailable(
  candidates: string[],
  available: Set<string>,
): string | null {
  for (const key of candidates) {
    if (available.has(key)) return key;
  }
  return null;
}

export function inferEssentiaInstrument(
  durationSeconds: number,
  metrics: EssentiaFeatureOutput["metrics"],
  familyTypeMap: Map<string, string[]>,
): EssentiaInstrumentGuess {
  const availableFamilies = new Set(familyTypeMap.keys());
  const pitch = metrics.pitch ?? 0;
  const pitchConfidence = metrics.pitchConfidence;
  const centroid = metrics.spectralCentroidHz ?? 0;

  const tonalScore = Math.max(0, Math.min(1, pitchConfidence));
  const likelyTonal = tonalScore >= 0.55;
  const likelyPercussive = tonalScore < 0.35 && durationSeconds < 1.2;
  const likelyLoop = durationSeconds >= 1.4;

  let familyKey: string | null = null;
  if (likelyTonal) {
    familyKey = pickFirstAvailable(
      ["keys", "synth", "bass", "guitar", "strings"],
      availableFamilies,
    );
    if (
      ((pitch > 0 && pitch < 140) || centroid < 300) &&
      availableFamilies.has("bass")
    ) {
      familyKey = "bass";
    }
  } else if (likelyPercussive) {
    familyKey = pickFirstAvailable(
      ["drums", "percussion", "fx"],
      availableFamilies,
    );
  } else if (likelyLoop) {
    familyKey = pickFirstAvailable(
      ["drums", "percussion", "texture_atmosphere", "fx"],
      availableFamilies,
    );
  } else {
    familyKey = pickFirstAvailable(
      ["texture_atmosphere", "fx", "synth"],
      availableFamilies,
    );
  }

  if (!familyKey) {
    return { familyKey: null, typeKey: null, confidence: 0 };
  }

  const types = familyTypeMap.get(familyKey) ?? [];
  const availableTypes = new Set(types);
  let typeKey: string | null = null;

  if (familyKey === "keys") {
    typeKey = pickFirstAvailable(
      ["piano", "electric_piano", "organ", "clavinet", "harpsichord"],
      availableTypes,
    );
  } else if (familyKey === "drums") {
    if (likelyLoop) {
      typeKey = pickFirstAvailable(["drum_loop", "drum_fill"], availableTypes);
    }
    if (!typeKey && pitch > 0 && pitch < 110) {
      typeKey = pickFirstAvailable(["kick", "tom"], availableTypes);
    }
    if (!typeKey && centroid > 4500) {
      typeKey = pickFirstAvailable(
        ["hi_hat", "cymbal", "clap", "snare"],
        availableTypes,
      );
    }
    if (!typeKey) {
      typeKey = pickFirstAvailable(
        ["snare", "clap", "tom", "kick"],
        availableTypes,
      );
    }
  } else if (familyKey === "bass") {
    if (pitch > 0 && pitch < 70) {
      typeKey = pickFirstAvailable(
        ["sub_bass", "synth_bass", "electric_bass"],
        availableTypes,
      );
    } else {
      typeKey = pickFirstAvailable(
        ["electric_bass", "synth_bass", "upright_bass", "bass"],
        availableTypes,
      );
    }
  } else if (familyKey === "synth") {
    if (likelyLoop || durationSeconds > 2.0) {
      typeKey = pickFirstAvailable(
        ["pad", "drone", "chord", "arp"],
        availableTypes,
      );
    } else {
      typeKey = pickFirstAvailable(
        ["lead", "pluck", "chord", "arp", "pad"],
        availableTypes,
      );
    }
  } else if (familyKey === "percussion") {
    typeKey = likelyLoop
      ? pickFirstAvailable(
          ["percussion_loop", "shaker", "tambourine"],
          availableTypes,
        )
      : pickFirstAvailable(
          ["shaker", "tambourine", "bongo", "conga", "cowbell"],
          availableTypes,
        );
  } else if (familyKey === "fx") {
    typeKey = likelyLoop
      ? pickFirstAvailable(
          ["riser", "downlifter", "sweep", "noise"],
          availableTypes,
        )
      : pickFirstAvailable(
          ["hit", "impact", "glitch", "noise"],
          availableTypes,
        );
  }

  if (!typeKey) {
    typeKey = types[0] ?? null;
  }

  const confidence = Math.max(0.5, Math.min(0.98, 0.5 + tonalScore * 0.45));
  return { familyKey, typeKey, confidence };
}

export async function loadTaxonomyCategoriesFromDb(): Promise<
  TaxonomyCategory[]
> {
  const now = Date.now();
  if (taxonomyCache && now - taxonomyCache.loadedAt < TAXONOMY_CACHE_TTL_MS) {
    return taxonomyCache.categories;
  }

  const attributes = await prisma.taxonomyAttribute.findMany({
    select: { id: true, key: true },
    orderBy: { key: "asc" },
  });

  const categories: TaxonomyCategory[] = [];
  for (const attribute of attributes) {
    const values = await prisma.$queryRaw<Array<{ id: string; key: string }>>`
      SELECT id, key
      FROM "taxonomy_value"
      WHERE "attributeId" = ${attribute.id}
      ORDER BY "sortOrder" ASC, key ASC
    `;

    if (values.length === 0) continue;

    categories.push({
      attributeKey: attribute.key,
      values: values.map((value) => ({
        id: value.id,
        key: value.key,
        prompt: buildTaxonomyPrompt(attribute.key, value.key),
      })),
    });
  }

  taxonomyCache = { loadedAt: now, categories };
  return categories;
}

/** Decode audio file to Float32Array (mono, 44.1kHz) using ffmpeg. */
export async function decodeAudioToFloat32(
  tmpFile: string,
  samplingRate: number,
): Promise<Float32Array> {
  if (!ffmpegPath || typeof ffmpegPath !== "string") {
    throw new Error("ffmpeg-static binary not found");
  }
  const ffmpeg = ffmpegPath;
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(
      ffmpeg,
      [
        "-i",
        tmpFile,
        "-f",
        "f32le",
        "-acodec",
        "pcm_f32le",
        "-ac",
        "1",
        "-ar",
        String(samplingRate),
        "pipe:1",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    ) as unknown as ChildProcessWithoutNullStreams;
    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", () => {});
    proc.on("error", reject);
    proc.on("close", (code: number | null) => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited with code ${code}`));
        return;
      }
      const buf = Buffer.concat(chunks);
      const samples = new Float32Array(buf.length / 4);
      for (let i = 0; i < samples.length; i++) {
        samples[i] = buf.readFloatLE(i * 4);
      }
      resolve(samples);
    });
  });
}

/** Extract BPM, loudness, and other Essentia features. */
export function extractEssentiaFeatures(
  audio: Float32Array,
  sampleRate: number,
): EssentiaFeatureOutput {
  const _out = process.stdout.write.bind(process.stdout);
  const _err = process.stderr.write.bind(process.stderr);
  process.stdout.write = () => true;
  process.stderr.write = () => true;
  const { EssentiaWASM, Essentia } = require("essentia.js");
  process.stdout.write = _out;
  process.stderr.write = _err;

  const essentia = new Essentia(EssentiaWASM);
  const attrs: Array<{ key: string; value: number }> = [];
  const metrics: EssentiaFeatureOutput["metrics"] = {
    bpm: null,
    pitch: null,
    pitchConfidence: 0,
    spectralCentroidHz: null,
    zeroCrossingRate: null,
  };

  try {
    const signalVector = essentia.arrayToVector(audio);

    const rhythm = essentia.RhythmExtractor2013(
      signalVector,
      208,
      "multifeature",
      40,
    );
    if (rhythm?.bpm != null && rhythm.bpm >= 40 && rhythm.bpm <= 250) {
      attrs.push({ key: "bpm", value: Math.round(rhythm.bpm * 10) / 10 });
      metrics.bpm = Math.round(rhythm.bpm * 10) / 10;
    }

    const loudnessResult = essentia.Loudness(signalVector);
    if (loudnessResult?.loudness != null) {
      attrs.push({ key: "loudness", value: loudnessResult.loudness });
    }

    const energyResult = essentia.Energy(signalVector);
    if (energyResult?.energy != null) {
      attrs.push({ key: "energy", value: energyResult.energy });
    }

    const pitchResult = essentia.PitchYin(signalVector, sampleRate);
    if (pitchResult?.pitch != null && Number.isFinite(pitchResult.pitch)) {
      metrics.pitch = pitchResult.pitch;
    }
    if (
      pitchResult?.pitchConfidence != null &&
      Number.isFinite(pitchResult.pitchConfidence)
    ) {
      metrics.pitchConfidence = pitchResult.pitchConfidence;
      attrs.push({
        key: "pitch_confidence",
        value: pitchResult.pitchConfidence,
      });
    }

    const centroidResult = essentia.SpectralCentroidTime(signalVector);
    if (
      centroidResult?.centroid != null &&
      Number.isFinite(centroidResult.centroid)
    ) {
      metrics.spectralCentroidHz = centroidResult.centroid;
      attrs.push({
        key: "spectral_centroid_hz",
        value: centroidResult.centroid,
      });
    }

    const zcrResult = essentia.ZeroCrossingRate(signalVector);
    if (
      zcrResult?.zeroCrossingRate != null &&
      Number.isFinite(zcrResult.zeroCrossingRate)
    ) {
      metrics.zeroCrossingRate = zcrResult.zeroCrossingRate;
      attrs.push({
        key: "zero_crossing_rate",
        value: zcrResult.zeroCrossingRate,
      });
    }

    essentia.shutdown();
  } catch (err) {
    essentia.shutdown();
    throw err;
  }

  return { attrs, metrics };
}
