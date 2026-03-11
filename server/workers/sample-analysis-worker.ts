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
): Array<{ key: string; value: number }> {
  const essentia = new Essentia(EssentiaWASM);
  const attrs: Array<{ key: string; value: number }> = [];

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

    essentia.shutdown();
  } catch (err) {
    essentia.shutdown();
    throw err;
  }

  return attrs;
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
    const essentiaAttrs = extractEssentiaFeatures(audio, samplingRate);

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

    for (const category of taxonomyCategories) {
      const candidateLabels = category.values.map((value) => value.prompt);
      if (candidateLabels.length === 0) continue;

      const scores = await classifier(audio, candidateLabels, {
        hypothesis_template: "This is {}.",
      });

      if (Array.isArray(scores) && scores.length > 0) {
        const top = scores[0] as { label?: string; score?: number } | undefined;
        if (top?.label != null && top?.score != null) {
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

worker.on("completed", (job) => {
  console.log(`[worker] Sample ${job.data.sampleId} analysis complete`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] Sample ${job?.data?.sampleId} failed:`, err);
});

console.log("[worker] Sample analysis worker started");
