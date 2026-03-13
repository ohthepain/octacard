/**
 * Essentia analysis queue. Jobs run first; on success enqueue CLAP.
 */

import { boss } from "../pgboss.js";

export const ESSENTIA_QUEUE = "essentia-analysis";

const QUEUE_OPTIONS = {
  retryLimit: 2,
  retryDelay: 5,
  retryBackoff: true,
} as const;

export async function ensureEssentiaQueue(): Promise<void> {
  const existing = await boss.getQueue(ESSENTIA_QUEUE);
  if (!existing) {
    await boss.createQueue(ESSENTIA_QUEUE, QUEUE_OPTIONS);
  }
}

export type EssentiaJobData = {
  sampleId: string;
  s3Key: string;
};

export async function enqueueEssentiaAnalysis(
  sampleId: string,
  s3Key: string,
): Promise<string | null> {
  await ensureEssentiaQueue();
  return boss.send(ESSENTIA_QUEUE, { sampleId, s3Key });
}
