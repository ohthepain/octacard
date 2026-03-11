import { Queue } from "bullmq";
import { redis } from "../redis.js";

const SAMPLE_ANALYSIS_QUEUE = "sample-analysis";

export const sampleAnalysisQueue = new Queue(SAMPLE_ANALYSIS_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 1000 },
  },
});

export type SampleAnalysisJobData = {
  sampleId: string;
  s3Key: string;
};

export async function enqueueSampleAnalysis(sampleId: string, s3Key: string): Promise<string | undefined> {
  const job = await sampleAnalysisQueue.add("analyze", { sampleId, s3Key });
  return job.id;
}
