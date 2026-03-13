/**
 * Essentia analysis worker: decode audio, extract features, Essentia-based taxonomy.
 * On success enqueues CLAP job.
 * Run: pnpm exec tsx server/workers/essentia-worker.ts
 */

import { pathToFileURL } from "node:url";
import { boss, startPgBoss } from "../pgboss.js";
import { prisma } from "../db.js";
import { getFromS3 } from "../s3.js";
import { enqueueClapAnalysis } from "../queues/clap-analysis.js";
import {
  decodeAudioToFloat32,
  extractEssentiaFeatures,
  inferEssentiaInstrument,
  loadInstrumentFamilyTypeMapFromDb,
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

const ESSENTIA_QUEUE = "essentia-analysis";
const CONCURRENCY = Number(process.env.ESSENTIA_WORKER_CONCURRENCY ?? 2);

async function runEssentiaAnalysis(sampleId: string, s3Key: string): Promise<void> {
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
    const durationMs = Math.round((audio.length / samplingRate) * 1000);
    const channels = 1;

    const { attrs: essentiaAttrs, metrics: essentiaMetrics } =
      extractEssentiaFeatures(audio, samplingRate);

    const taxonomyCategories = await loadTaxonomyCategoriesFromDb();
    const familyTypeMap = await loadInstrumentFamilyTypeMapFromDb();
    const familyCategory = taxonomyCategories.find(
      (c) => c.attributeKey === INSTRUMENT_FAMILY_KEY,
    );
    const typeCategory = taxonomyCategories.find(
      (c) => c.attributeKey === INSTRUMENT_TYPE_KEY,
    );
    const durationSeconds = audio.length / samplingRate;
    const instrumentGuess = inferEssentiaInstrument(
      durationSeconds,
      essentiaMetrics,
      familyTypeMap,
    );

    const annotations: Array<{
      taxonomyValueId: string;
      confidence: number;
      source: string;
      rank: number;
    }> = [];
    let rank = 0;

    if (familyCategory && instrumentGuess.familyKey) {
      const familyValue = familyCategory.values.find(
        (value) => value.key === instrumentGuess.familyKey,
      );
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
      const typeValue = typeCategory.values.find(
        (value) => value.key === instrumentGuess.typeKey,
      );
      if (typeValue) {
        annotations.push({
          taxonomyValueId: typeValue.id,
          confidence: instrumentGuess.confidence,
          source: "essentia",
          rank: rank++,
        });
      }
    }

    await prisma.$transaction(async (tx) => {
      await tx.sample.update({
        where: { id: sampleId },
        data: {
          durationMs,
          sampleRate: samplingRate,
          channels,
          analysisStatus: "PROCESSING",
          analysisError: null,
        },
      });

      for (const { key, value } of essentiaAttrs) {
        await tx.sampleAttribute.upsert({
          where: { sampleId_key: { sampleId, key } },
          create: { sampleId, key, value },
          update: { value },
        });
      }

      await tx.sampleAnnotation.deleteMany({
        where: { sampleId, source: "essentia" },
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

    await enqueueClapAnalysis(sampleId, s3Key);
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
  }
}

export function startEssentiaWorker(): string {
  markWorkerStartAttempt(ESSENTIA_QUEUE);
  setWorkerEnabled(ESSENTIA_QUEUE, true);
  markWorkerStarted(ESSENTIA_QUEUE);

  boss
    .work<{ sampleId: string; s3Key: string }>(
      ESSENTIA_QUEUE,
      { localConcurrency: CONCURRENCY },
      async (jobs) => {
        for (const job of jobs) {
          const { sampleId, s3Key } = job.data;
          markWorkerJobStarted(ESSENTIA_QUEUE, sampleId);
          try {
            await prisma.sample.update({
              where: { id: sampleId },
              data: { analysisStatus: "PROCESSING" },
            });
            await runEssentiaAnalysis(sampleId, s3Key);
            markWorkerJobCompleted(ESSENTIA_QUEUE, sampleId);
          } catch (err) {
            await prisma.sample.update({
              where: { id: sampleId },
              data: {
                analysisStatus: "FAILED",
                analysisError: err instanceof Error ? err.message : String(err),
              },
            });
            markWorkerError(ESSENTIA_QUEUE, err);
            throw err;
          }
        }
      },
    )
    .then(() => {
      markWorkerReady(ESSENTIA_QUEUE);
      console.log(`[worker] Essentia worker connected and ready`);
    })
    .catch((err) => {
      markWorkerError(ESSENTIA_QUEUE, err);
      console.error("[worker] Essentia worker failed:", err);
    });

  return ESSENTIA_QUEUE;
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  (async () => {
    await startPgBoss();
    startEssentiaWorker();
    console.log("[worker] Essentia worker started");
  })().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
