/**
 * CLAP analysis queue. Runs after Essentia; on success sets analysisStatus READY.
 */

import { boss } from "../pgboss.js";

export const CLAP_QUEUE = "clap-analysis";

const QUEUE_OPTIONS = {
  retryLimit: 2,
  retryDelay: 5,
  retryBackoff: true,
} as const;

export async function ensureClapQueue(): Promise<void> {
  const existing = await boss.getQueue(CLAP_QUEUE);
  if (!existing) {
    await boss.createQueue(CLAP_QUEUE, QUEUE_OPTIONS);
  }
}

export type ClapJobData = {
  sampleId: string;
  s3Key: string;
};

export async function enqueueClapAnalysis(
  sampleId: string,
  s3Key: string,
): Promise<string | null> {
  await ensureClapQueue();
  return boss.send(CLAP_QUEUE, { sampleId, s3Key });
}
