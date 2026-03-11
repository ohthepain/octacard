/**
 * Sample analysis worker: Essentia features + CLAP embeddings + taxonomy assignment.
 * Run: pnpm exec tsx server/workers/sample-analysis-worker.ts
 */
import { createRequire } from "node:module";
import { Worker } from "bullmq";
import { workerRedis } from "../redis.js";
import { prisma } from "../db.js";
import { getFromS3 } from "../s3.js";
import { pipeline } from "@xenova/transformers";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import { pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);

// Suppress Essentia WASM/Emscripten spew during load
const _out = process.stdout.write.bind(process.stdout);
const _err = process.stderr.write.bind(process.stderr);
process.stdout.write = () => true;
process.stderr.write = () => true;
const { EssentiaWASM, Essentia } = require("essentia.js");
process.stdout.write = _out;
process.stderr.write = _err;

const QUEUE_NAME = "sample-analysis";
const TAXONOMY_CACHE_TTL_MS = 30_000;
const MIN_TAXONOMY_CONFIDENCE = Number(process.env.ANALYSIS_MIN_TAXONOMY_CONFIDENCE ?? 0.2);
const INSTRUMENT_FAMILY_KEY = "instrument_family";
const INSTRUMENT_TYPE_KEY = "instrument_type";

type TaxonomyCategory = {
  attributeKey: string;
  values: Array<{ id: string; key: string; prompt: string }>;
};

let taxonomyCache:
  | {
      loadedAt: number;
      categories: TaxonomyCategory[];
    }
  | null = null;
let familyTypeMapCache:
  | {
      loadedAt: number;
      map: Map<string, string[]>;
    }
  | null = null;

function buildTaxonomyPrompt(attributeKey: string, valueKey: string): string {
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

async function loadInstrumentFamilyTypeMapFromDb(): Promise<Map<string, string[]>> {
  const now = Date.now();
  if (familyTypeMapCache && now - familyTypeMapCache.loadedAt < TAXONOMY_CACHE_TTL_MS) {
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

type EssentiaInstrumentGuess = {
  familyKey: string | null;
  typeKey: string | null;
  confidence: number;
};

type EssentiaFeatureOutput = {
  attrs: Array<{ key: string; value: number }>;
  metrics: {
    bpm: number | null;
    pitch: number | null;
    pitchConfidence: number;
    spectralCentroidHz: number | null;
    zeroCrossingRate: number | null;
  };
};

function pickFirstAvailable(candidates: string[], available: Set<string>): string | null {
  for (const key of candidates) {
    if (available.has(key)) return key;
  }
  return null;
}

function inferEssentiaInstrument(
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
    familyKey = pickFirstAvailable(["keys", "synth", "bass", "guitar", "strings"], availableFamilies);
    if ((pitch > 0 && pitch < 140 || centroid < 300) && availableFamilies.has("bass")) {
      familyKey = "bass";
    }
  } else if (likelyPercussive) {
    familyKey = pickFirstAvailable(["drums", "percussion", "fx"], availableFamilies);
  } else if (likelyLoop) {
    familyKey = pickFirstAvailable(["drums", "percussion", "texture_atmosphere", "fx"], availableFamilies);
  } else {
    familyKey = pickFirstAvailable(["texture_atmosphere", "fx", "synth"], availableFamilies);
  }

  if (!familyKey) {
    return { familyKey: null, typeKey: null, confidence: 0 };
  }

  const types = familyTypeMap.get(familyKey) ?? [];
  const availableTypes = new Set(types);
  let typeKey: string | null = null;

  if (familyKey === "keys") {
    typeKey = pickFirstAvailable(["piano", "electric_piano", "organ", "clavinet", "harpsichord"], availableTypes);
  } else if (familyKey === "drums") {
    if (likelyLoop) {
      typeKey = pickFirstAvailable(["drum_loop", "drum_fill"], availableTypes);
    }
    if (!typeKey && pitch > 0 && pitch < 110) {
      typeKey = pickFirstAvailable(["kick", "tom"], availableTypes);
    }
    if (!typeKey && centroid > 4500) {
      typeKey = pickFirstAvailable(["hi_hat", "cymbal", "clap", "snare"], availableTypes);
    }
    if (!typeKey) {
      typeKey = pickFirstAvailable(["snare", "clap", "tom", "kick"], availableTypes);
    }
  } else if (familyKey === "bass") {
    if (pitch > 0 && pitch < 70) {
      typeKey = pickFirstAvailable(["sub_bass", "synth_bass", "electric_bass"], availableTypes);
    } else {
      typeKey = pickFirstAvailable(["electric_bass", "synth_bass", "upright_bass", "bass"], availableTypes);
    }
  } else if (familyKey === "synth") {
    if (likelyLoop || durationSeconds > 2.0) {
      typeKey = pickFirstAvailable(["pad", "drone", "chord", "arp"], availableTypes);
    } else {
      typeKey = pickFirstAvailable(["lead", "pluck", "chord", "arp", "pad"], availableTypes);
    }
  } else if (familyKey === "percussion") {
    typeKey = likelyLoop
      ? pickFirstAvailable(["percussion_loop", "shaker", "tambourine"], availableTypes)
      : pickFirstAvailable(["shaker", "tambourine", "bongo", "conga", "cowbell"], availableTypes);
  } else if (familyKey === "fx") {
    typeKey = likelyLoop
      ? pickFirstAvailable(["riser", "downlifter", "sweep", "noise"], availableTypes)
      : pickFirstAvailable(["hit", "impact", "glitch", "noise"], availableTypes);
  }

  if (!typeKey) {
    typeKey = types[0] ?? null;
  }

  const confidence = Math.max(0.5, Math.min(0.98, 0.5 + tonalScore * 0.45));
  return { familyKey, typeKey, confidence };
}

async function loadTaxonomyCategoriesFromDb(): Promise<TaxonomyCategory[]> {
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

/** Decode audio file to Float32Array (mono, 44.1kHz) using ffmpeg. Node.js has no AudioContext. */
async function decodeAudioToFloat32(
  tmpFile: string,
  samplingRate: number
): Promise<Float32Array> {
  if (!ffmpegPath || typeof ffmpegPath !== "string") {
    throw new Error("ffmpeg-static binary not found");
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(
      ffmpegPath,
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
      { stdio: ["ignore", "pipe", "pipe"] }
    );
    proc.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr?.on("data", () => {}); // ffmpeg logs to stderr
    proc.on("error", reject);
    proc.on("close", (code) => {
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

/** Extract BPM, loudness, and other Essentia features. Returns attributes to store. */
function extractEssentiaFeatures(
  audio: Float32Array,
  sampleRate: number
): EssentiaFeatureOutput {
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

    // BPM via RhythmExtractor2013 (multifeature is more accurate; degara is faster)
    const rhythm = essentia.RhythmExtractor2013(
      signalVector,
      208, // maxTempo
      "multifeature", // method
      40 // minTempo
    );
    if (
      rhythm?.bpm != null &&
      rhythm.bpm >= 40 &&
      rhythm.bpm <= 250
    ) {
      attrs.push({ key: "bpm", value: Math.round(rhythm.bpm * 10) / 10 });
      metrics.bpm = Math.round(rhythm.bpm * 10) / 10;
    }

    // Loudness (RMS-based)
    const loudnessResult = essentia.Loudness(signalVector);
    if (loudnessResult?.loudness != null) {
      attrs.push({ key: "loudness", value: loudnessResult.loudness });
    }

    // Energy
    const energyResult = essentia.Energy(signalVector);
    if (energyResult?.energy != null) {
      attrs.push({ key: "energy", value: energyResult.energy });
    }

    const pitchResult = essentia.PitchYin(signalVector, sampleRate);
    if (pitchResult?.pitch != null && Number.isFinite(pitchResult.pitch)) {
      metrics.pitch = pitchResult.pitch;
    }
    if (pitchResult?.pitchConfidence != null && Number.isFinite(pitchResult.pitchConfidence)) {
      metrics.pitchConfidence = pitchResult.pitchConfidence;
      attrs.push({ key: "pitch_confidence", value: pitchResult.pitchConfidence });
    }

    const centroidResult = essentia.SpectralCentroidTime(signalVector);
    if (centroidResult?.centroid != null && Number.isFinite(centroidResult.centroid)) {
      metrics.spectralCentroidHz = centroidResult.centroid;
      attrs.push({ key: "spectral_centroid_hz", value: centroidResult.centroid });
    }

    const zcrResult = essentia.ZeroCrossingRate(signalVector);
    if (zcrResult?.zeroCrossingRate != null && Number.isFinite(zcrResult.zeroCrossingRate)) {
      metrics.zeroCrossingRate = zcrResult.zeroCrossingRate;
      attrs.push({ key: "zero_crossing_rate", value: zcrResult.zeroCrossingRate });
    }

    essentia.shutdown();
  } catch (err) {
    essentia.shutdown();
    throw err;
  }

  return { attrs, metrics };
}

async function analyzeSample(sampleId: string, s3Key: string) {
  const buffer = await getFromS3(s3Key);
  if (!buffer) throw new Error(`Failed to fetch sample from S3: ${s3Key}`);

  // Write to temp file for read_audio (accepts path/URL)
  const tmpDir = process.env.TMPDIR || "/tmp";
  const tmpPath = `${tmpDir}/octacard-sample-${sampleId}-${Date.now()}.wav`;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const ext = path.extname(s3Key).toLowerCase();
  const tmpFile = tmpPath.replace(".wav", ext || ".wav");
  fs.writeFileSync(tmpFile, buffer);

  try {
    // 1. Decode audio to Float32Array (Node.js has no AudioContext; use ffmpeg)
    const samplingRate = 44100; // CLAP expects 44.1k
    const audio = await decodeAudioToFloat32(tmpFile, samplingRate);
    const durationMs = Math.round((audio.length / samplingRate) * 1000);
    const channels = 1; // ffmpeg outputs mono

    // 2. Essentia features (BPM, loudness, energy)
    const { attrs: essentiaAttrs, metrics: essentiaMetrics } = extractEssentiaFeatures(audio, samplingRate);

    // 3. CLAP embedding
    const { AutoProcessor, ClapAudioModelWithProjection } =
      await import("@xenova/transformers");
    const processor = await AutoProcessor.from_pretrained(
      "Xenova/larger_clap_music_and_speech"
    );
    const audioModel = await ClapAudioModelWithProjection.from_pretrained(
      "Xenova/larger_clap_music_and_speech"
    );

    const audioInputs = await processor(audio, { sampling_rate: samplingRate });
    const { audio_embeds } = await audioModel(audioInputs);
    const embedding = audio_embeds.data;
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

    // 4. Zero-shot taxonomy assignment via CLAP
    const classifier = await pipeline(
      "zero-shot-audio-classification",
      "Xenova/larger_clap_music_and_speech"
    );

    const annotations: Array<{
      taxonomyValueId: string;
      confidence: number;
      source: string;
      rank: number;
    }> = [];
    let rank = 0;

    const taxonomyCategories = await loadTaxonomyCategoriesFromDb();
    const familyTypeMap = await loadInstrumentFamilyTypeMapFromDb();

    const familyCategory = taxonomyCategories.find((c) => c.attributeKey === INSTRUMENT_FAMILY_KEY);
    const typeCategory = taxonomyCategories.find((c) => c.attributeKey === INSTRUMENT_TYPE_KEY);
    const durationSeconds = audio.length / samplingRate;
    const instrumentGuess = inferEssentiaInstrument(durationSeconds, essentiaMetrics, familyTypeMap);

    if (familyCategory && instrumentGuess.familyKey) {
      const familyValue = familyCategory.values.find((value) => value.key === instrumentGuess.familyKey);
      if (familyValue) {
        annotations.push({
          taxonomyValueId: familyValue.id,
          confidence: instrumentGuess.confidence,
          source: "essentia",
          rank: rank++,
        });
      }
    }
    if (typeCategory && instrumentGuess.typeKey) {
      const typeValue = typeCategory.values.find((value) => value.key === instrumentGuess.typeKey);
      if (typeValue) {
        annotations.push({
          taxonomyValueId: typeValue.id,
          confidence: instrumentGuess.confidence,
          source: "essentia",
          rank: rank++,
        });
      }
    }

    for (const category of taxonomyCategories) {
      if (category.attributeKey === INSTRUMENT_FAMILY_KEY || category.attributeKey === INSTRUMENT_TYPE_KEY) {
        continue;
      }
      const candidateLabels = category.values.map((value) => {
        return value.prompt;
      });
      if (candidateLabels.length === 0) continue;

      const scores = await classifier(audio, candidateLabels, {
        hypothesis_template: "This is {}.",
      });

      if (Array.isArray(scores) && scores.length > 0) {
        const top = scores[0] as { label?: string; score?: number } | undefined;
        if (top?.label != null && top?.score != null && top.score >= MIN_TAXONOMY_CONFIDENCE) {
          const idx = candidateLabels.indexOf(top.label);
          const taxonomyValue = idx >= 0 ? category.values[idx] : category.values[0];
          if (taxonomyValue) {
            annotations.push({
              taxonomyValueId: taxonomyValue.id,
              confidence: top.score,
              source: "clap",
              rank: rank++,
            });
          }
        }
      }
    }

    // 5. Persist
    await prisma.$transaction(async (tx) => {
      await tx.sample.update({
        where: { id: sampleId },
        data: {
          durationMs,
          sampleRate: samplingRate,
          channels,
          analysisStatus: "READY",
          analysisError: null,
        },
      });

      for (const { key, value } of essentiaAttrs) {
        await tx.sampleAttribute.upsert({
          where: {
            sampleId_key: { sampleId, key },
          },
          create: { sampleId, key, value },
          update: { value },
        });
      }

      await tx.sampleEmbedding.upsert({
        where: {
          sampleId_model: { sampleId, model: "clap" },
        },
        create: {
          sampleId,
          model: "clap",
          modelVersion: "v1",
          dimensions: 512,
          vector: embeddingBuffer,
        },
        update: {
          vector: embeddingBuffer,
          modelVersion: "v1",
        },
      });

      await tx.sampleAnnotation.deleteMany({
        where: {
          sampleId,
          source: {
            in: ["clap", "essentia"],
          },
        },
      });

      for (const ann of annotations) {
        await tx.sampleAnnotation.upsert({
          where: {
            sampleId_taxonomyValueId: {
              sampleId,
              taxonomyValueId: ann.taxonomyValueId,
            },
          },
          create: {
            sampleId,
            taxonomyValueId: ann.taxonomyValueId,
            confidence: ann.confidence,
            source: ann.source,
            rank: ann.rank,
          },
          update: {
            confidence: ann.confidence,
            source: ann.source,
            rank: ann.rank,
          },
        });
      }
    });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

function createSampleAnalysisWorker() {
  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      const { sampleId, s3Key } = job.data as { sampleId: string; s3Key: string };
      await prisma.sample.update({
        where: { id: sampleId },
        data: { analysisStatus: "PROCESSING" },
      });
      try {
        await analyzeSample(sampleId, s3Key);
      } catch (err) {
        await prisma.sample.update({
          where: { id: sampleId },
          data: {
            analysisStatus: "FAILED",
            analysisError: err instanceof Error ? err.message : String(err),
          },
        });
        throw err;
      }
    },
    {
      connection: workerRedis,
      concurrency: 1, // CLAP is heavy; one at a time for V1
    }
  );

  worker.on("ready", () => {
    console.log("[worker] Sample analysis worker connected to Redis and ready");
  });

  worker.on("active", (job) => {
    console.log(`[worker] Processing sample ${job.data.sampleId}`);
  });

  worker.on("completed", (job) => {
    console.log(`[worker] Sample ${job.data.sampleId} analysis complete`);
  });

  worker.on("stalled", (jobId) => {
    console.warn(`[worker] Job stalled: ${jobId}`);
  });

  worker.on("error", (err) => {
    console.error("[worker] Worker error:", err);
  });

  worker.on("failed", (job, err) => {
    console.error(`[worker] Sample ${job?.data?.sampleId} failed:`, err);
  });

  return worker;
}

export function startSampleAnalysisWorker() {
  const worker = createSampleAnalysisWorker();
  console.log("[worker] Sample analysis worker started");
  void worker.waitUntilReady().catch((err) => {
    console.error("[worker] Failed to become ready:", err);
  });
  return worker;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  const worker = startSampleAnalysisWorker();
  const shutdown = async () => {
    console.log("[worker] Shutting down sample analysis worker...");
    await worker.close();
    await workerRedis.quit();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void shutdown();
  });
  process.once("SIGTERM", () => {
    void shutdown();
  });
}
