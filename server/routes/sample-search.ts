/**
 * Sample search API: faceted search, similarity, text-search.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { prisma } from "../db.js";
import { getPresignedDownloadUrl } from "../s3.js";

const sampleSearchApp = new Hono<{ Variables: AppVariables }>();

const searchSamplesSchema = z.object({
  instrument_family: z.string().optional(),
  instrument_type: z.string().optional(),
  style: z.string().optional(),
  descriptor: z.string().optional(),
  mood: z.string().optional(),
  bpmMin: z.coerce.number().optional(),
  bpmMax: z.coerce.number().optional(),
  durationMinMs: z.coerce.number().optional(),
  durationMaxMs: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

const similarSamplesSchema = z.object({
  sampleId: z.string().trim().min(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

const textSearchSchema = z.object({
  query: z.string().trim().min(1).max(500),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

async function buildSampleResult(
  sampleId: string,
  userId: string,
  extra?: { distance?: number }
) {
  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    include: {
      attributes: { select: { key: true, value: true } },
      annotations: {
        include: {
          taxonomyValue: {
            include: { attribute: { select: { key: true } } },
          },
        },
      },
      packSamples: {
        where: { OR: [{ ownerId: userId }, { credits: 0 }] },
        take: 1,
        include: { pack: { select: { id: true, name: true } } },
      },
    },
  });
  if (!sample) return null;

  const ps = sample.packSamples[0];
  const inCollection = await prisma.sampleCollection.findUnique({
    where: { userId_sampleId: { userId, sampleId } },
    select: { id: true },
  });
  const downloadUrl = ps
    ? await getPresignedDownloadUrl(sample.s3Key)
    : null;

  const taxonomy: Record<string, string[]> = {};
  for (const ann of sample.annotations) {
    const attrKey = ann.taxonomyValue.attribute.key;
    if (!taxonomy[attrKey]) taxonomy[attrKey] = [];
    taxonomy[attrKey].push(ann.taxonomyValue.key);
  }

  const attrs: Record<string, number> = {};
  for (const a of sample.attributes) attrs[a.key] = a.value;

  return {
    id: sample.id,
    name: ps?.name ?? sample.id,
    packId: ps?.packId ?? null,
    packName: ps?.pack?.name ?? null,
    credits: ps?.credits ?? null,
    sizeBytes: sample.sizeBytes,
    contentType: sample.contentType,
    durationMs: sample.durationMs,
    sampleRate: sample.sampleRate,
    channels: sample.channels,
    analysisStatus: sample.analysisStatus,
    taxonomy,
    attributes: attrs,
    inCollection: Boolean(inCollection),
    canDownload: Boolean(ps),
    downloadUrl,
    ...(extra?.distance != null && { similarity: 1 - extra.distance }),
  };
}

// GET / - faceted search on canonical fields (mounted at /samples/search)
sampleSearchApp.get("/", zValidator("query", searchSamplesSchema), async (c) => {
  const user = c.get("user");
  const params = c.req.valid("query");

  const taxonomyConditions: Array<{ taxonomyValue: { key: string; attribute: { key: string } } }> = [];
  if (params.instrument_family)
    taxonomyConditions.push({
      taxonomyValue: {
        key: params.instrument_family,
        attribute: { key: "instrument_family" },
      },
    });
  if (params.instrument_type)
    taxonomyConditions.push({
      taxonomyValue: {
        key: params.instrument_type,
        attribute: { key: "instrument_type" },
      },
    });
  if (params.style)
    taxonomyConditions.push({
      taxonomyValue: { key: params.style, attribute: { key: "style" } },
    });
  if (params.descriptor)
    taxonomyConditions.push({
      taxonomyValue: { key: params.descriptor, attribute: { key: "descriptor" } },
    });
  if (params.mood)
    taxonomyConditions.push({
      taxonomyValue: { key: params.mood, attribute: { key: "mood" } },
    });

  const samples = await prisma.sample.findMany({
    where: {
      analysisStatus: "READY",
      ...(taxonomyConditions.length > 0 && {
        AND: taxonomyConditions.map((cond) => ({
          annotations: {
            some: {
              taxonomyValue: {
                key: cond.taxonomyValue.key,
                attribute: { key: cond.taxonomyValue.attribute.key },
              },
            },
          },
        })),
      }),
      ...(params.durationMinMs != null && { durationMs: { gte: params.durationMinMs } }),
      ...(params.durationMaxMs != null && { durationMs: { lte: params.durationMaxMs } }),
    },
    include: {
      packSamples: {
        where: { OR: [{ ownerId: user.id }, { credits: 0 }] },
        take: 1,
      },
    },
    take: params.limit,
    skip: params.offset,
  });

  // Filter by BPM if provided (stored in SampleAttribute)
  let filtered = samples;
  if (params.bpmMin != null || params.bpmMax != null) {
    const withBpm = await prisma.sampleAttribute.findMany({
      where: {
        sampleId: { in: samples.map((s) => s.id) },
        key: "bpm",
        ...(params.bpmMin != null && { value: { gte: params.bpmMin } }),
        ...(params.bpmMax != null && { value: { lte: params.bpmMax } }),
      },
      select: { sampleId: true },
    });
    const bpmSampleIds = new Set(withBpm.map((a) => a.sampleId));
    filtered = samples.filter((s) => bpmSampleIds.has(s.id));
  }

  const results = await Promise.all(
    filtered.map((s) => buildSampleResult(s.id, user.id))
  );
  return c.json({ samples: results.filter(Boolean) });
});

// POST /similar - nearest neighbors from sample ID (audio-to-audio)
sampleSearchApp.post("/similar", zValidator("json", similarSamplesSchema), async (c) => {
  const user = c.get("user");
  const { sampleId, limit } = c.req.valid("json");

  const source = await prisma.sampleEmbedding.findUnique({
    where: { sampleId_model: { sampleId, model: "clap" } },
    select: { vector: true },
  });
  if (!source?.vector) {
    return c.json({ error: "Sample has no embedding" }, 400);
  }

  const sourceVec = new Float32Array(
    source.vector.buffer,
    source.vector.byteOffset,
    source.vector.length / 4
  );

  const all = await prisma.sampleEmbedding.findMany({
    where: { model: "clap", sampleId: { not: sampleId } },
    select: { sampleId: true, vector: true },
  });

  const scored = all
    .filter((e) => e.vector)
    .map((e) => {
      const vec = new Float32Array(
        e.vector!.buffer,
        e.vector!.byteOffset,
        e.vector!.length / 4
      );
      const sim = cosineSimilarity(sourceVec, vec);
      return { sampleId: e.sampleId, similarity: sim };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  const results = await Promise.all(
    scored.map((s) => buildSampleResult(s.sampleId, user.id, { distance: 1 - s.similarity }))
  );
  return c.json({ samples: results.filter(Boolean) });
});

// POST /text-search - CLAP text embedding vs stored audio embeddings
sampleSearchApp.post("/text-search", zValidator("json", textSearchSchema), async (c) => {
  const user = c.get("user");
  const { query, limit } = c.req.valid("json");

  const { AutoTokenizer, ClapTextModelWithProjection } = await import(
    "@xenova/transformers"
  );
  const tokenizer = await AutoTokenizer.from_pretrained(
    "Xenova/larger_clap_music_and_speech"
  );
  const textModel = await ClapTextModelWithProjection.from_pretrained(
    "Xenova/larger_clap_music_and_speech"
  );

  const textInputs = tokenizer([query], { padding: true, truncation: true });
  const { text_embeds } = await textModel(textInputs);
  const queryVec = new Float32Array(text_embeds.data);

  const all = await prisma.sampleEmbedding.findMany({
    where: { model: "clap" },
    select: { sampleId: true, vector: true },
  });

  const scored = all
    .filter((e) => e.vector)
    .map((e) => {
      const vec = new Float32Array(
        e.vector!.buffer,
        e.vector!.byteOffset,
        e.vector!.length / 4
      );
      const sim = cosineSimilarity(queryVec, vec);
      return { sampleId: e.sampleId, similarity: sim };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  const results = await Promise.all(
    scored.map((s) => buildSampleResult(s.sampleId, user.id, { distance: 1 - s.similarity }))
  );
  return c.json({ samples: results.filter(Boolean) });
});

export { sampleSearchApp };
