/**
 * CLAP analysis worker: embedding + zero-shot taxonomy for style/descriptor/mood.
 * Runs after Essentia; on success sets analysisStatus READY.
 * Run: pnpm exec tsx server/workers/clap-worker.ts
 */

import { pathToFileURL } from "node:url";
import { pipeline } from "@xenova/transformers";
import { boss, startPgBoss } from "../pgboss.js";
import { prisma } from "../db.js";
import { getFromS3 } from "../s3.js";
import {
  decodeAudioToFloat32,
  loadTaxonomyCategoriesFromDb,
  INSTRUMENT_FAMILY_KEY,
  INSTRUMENT_TYPE_KEY,
} from "./analysis-shared.js";
import {
  setWorkerEnabled,
  markWorkerError,
  markWorkerJobCompleted,
  markWorkerJobStarted,
  markWorkerReady,
  markWorkerStartAttempt,
  markWorkerStarted,
} from "./worker-state.js";

const CLAP_QUEUE = "clap-analysis";
const MIN_TAXONOMY_CONFIDENCE = Number(
  process.env.ANALYSIS_MIN_TAXONOMY_CONFIDENCE ?? 0.2,
);

async function runClapAnalysis(sampleId: string, s3Key: string): Promise<void> {
  const buffer = await getFromS3(s3Key);
  if (!buffer) throw new Error(`Failed to fetch sample from S3: ${s3Key}`);

  const tmpDir = process.env.TMPDIR || "/tmp";
  const tmpPath = `${tmpDir}/octacard-sample-${sampleId}-${Date.now()}.wav`;
  const fs = await import("node:fs");
  const path = await import("node:path");
  const ext = path.extname(s3Key).toLowerCase();
  const tmpFile = tmpPath.replace(".wav", ext || ".wav");
  fs.writeFileSync(tmpFile, buffer);

  try {
    const samplingRate = 44100;
    const audio = await decodeAudioToFloat32(tmpFile, samplingRate);

    const { AutoProcessor, ClapAudioModelWithProjection } = await import(
      "@xenova/transformers"
    );
    const processor = await AutoProcessor.from_pretrained(
      "Xenova/larger_clap_music_and_speech",
    );
    const audioModel = await ClapAudioModelWithProjection.from_pretrained(
      "Xenova/larger_clap_music_and_speech",
    );

    const audioInputs = await processor(audio, { sampling_rate: samplingRate });
    const { audio_embeds } = await audioModel(audioInputs);
    const embedding = audio_embeds.data;
    const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

    const classifier = await pipeline(
      "zero-shot-audio-classification",
      "Xenova/larger_clap_music_and_speech",
    );

    const taxonomyCategories = await loadTaxonomyCategoriesFromDb();
    const annotations: Array<{
      taxonomyValueId: string;
      confidence: number;
      source: string;
      rank: number;
    }> = [];
    let rank = 0;

    for (const category of taxonomyCategories) {
      if (
        category.attributeKey === INSTRUMENT_FAMILY_KEY ||
        category.attributeKey === INSTRUMENT_TYPE_KEY
      ) {
        continue;
      }
      const candidateLabels = category.values.map((value) => value.prompt);
      if (candidateLabels.length === 0) continue;

      const scores = await classifier(audio, candidateLabels, {
        hypothesis_template: "This is {}.",
      });

      if (Array.isArray(scores) && scores.length > 0) {
        const top = scores[0] as { label?: string; score?: number } | undefined;
        if (
          top?.label != null &&
          top?.score != null &&
          top.score >= MIN_TAXONOMY_CONFIDENCE
        ) {
          const idx = candidateLabels.indexOf(top.label);
          const taxonomyValue =
            idx >= 0 ? category.values[idx] : category.values[0];
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

    await prisma.$transaction(async (tx) => {
      await tx.sampleEmbedding.upsert({
        where: { sampleId_model: { sampleId, model: "clap" } },
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
        where: { sampleId, source: "clap" },
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

      await tx.sample.update({
        where: { id: sampleId },
        data: {
          analysisStatus: "READY",
          analysisError: null,
        },
      });
    });
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

export function startClapWorker(): string {
  markWorkerStartAttempt(CLAP_QUEUE);
  setWorkerEnabled(CLAP_QUEUE, true);
  markWorkerStarted(CLAP_QUEUE);

  boss
    .work<{ sampleId: string; s3Key: string }>(
      CLAP_QUEUE,
      { localConcurrency: 1 },
      async (jobs) => {
        for (const job of jobs) {
          const { sampleId, s3Key } = job.data;
          markWorkerJobStarted(CLAP_QUEUE, sampleId);
          try {
            await runClapAnalysis(sampleId, s3Key);
            markWorkerJobCompleted(CLAP_QUEUE, sampleId);
          } catch (err) {
            await prisma.sample.update({
              where: { id: sampleId },
              data: {
                analysisStatus: "FAILED",
                analysisError: err instanceof Error ? err.message : String(err),
              },
            });
            markWorkerError(CLAP_QUEUE, err);
            throw err;
          }
        }
      },
    )
    .then(() => {
      markWorkerReady(CLAP_QUEUE);
      console.log(`[worker] CLAP worker connected and ready`);
    })
    .catch((err) => {
      markWorkerError(CLAP_QUEUE, err);
      console.error("[worker] CLAP worker failed:", err);
    });

  return CLAP_QUEUE;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  (async () => {
    await startPgBoss();
    startClapWorker();
    console.log("[worker] CLAP worker started");
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
