import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { prisma } from "../db.js";
import { getFromS3, getPresignedUploadUrl, getPresignedDownloadUrl } from "../s3.js";
import { enqueueSampleAnalysis } from "../queues/sample-analysis.js";
import { sampleSearchApp } from "./sample-search.js";
import { tracedFetch } from "../external-api-trace.js";

const libraryApp = new Hono<{ Variables: AppVariables }>();

const searchSchema = z.object({
  q: z.string().trim().default(""),
  scope: z.enum(["mine", "all", "explore"]).default("all"),
  types: z.enum(["packs", "samples", "both"]).default("both"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const createPackSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().trim().min(1).optional(),
  isPublic: z.boolean().default(true),
  priceTokens: z.number().int().min(0).default(0),
  defaultSampleTokens: z.number().int().min(0).default(0),
});

const updatePackSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
  coverImageS3Key: z.string().trim().min(1).nullable().optional(),
  isPublic: z.boolean().optional(),
  priceTokens: z.number().int().min(0).optional(),
  defaultSampleTokens: z.number().int().min(0).optional(),
});

const packCoverUploadSchema = z.object({
  contentType: z.string().trim().min(1).default("image/jpeg"),
});

const uploadSampleSchema = z.object({
  packId: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).default("application/octet-stream"),
  sizeBytes: z.number().int().nonnegative().optional(),
  credits: z.number().int().min(0).default(0),
});

const createSampleSchema = z.object({
  packId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(255),
  s3Key: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
  credits: z.number().int().min(0).default(0),
});

const checkSamplesExistSchema = z.object({
  contentHashes: z.array(z.string().trim().length(64)).max(500),
});

const uploadByContentHashSchema = z.object({
  packId: z.string().trim().min(1),
  contentHash: z.string().trim().length(64),
  contentType: z.string().trim().min(1).default("application/octet-stream"),
  fileName: z.string().trim().min(1).max(255),
});

const createSampleFromContentSchema = z.object({
  packId: z.string().trim().min(1),
  name: z.string().trim().min(1).max(255),
  contentHash: z.string().trim().length(64),
  contentType: z.string().trim().min(1),
  sizeBytes: z.number().int().nonnegative().optional(),
  credits: z.number().int().min(0).default(0),
});

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function sanitizePathSegment(value: string): string {
  const base = value.replace(/[\\/]/g, "_").replace(/\s+/g, " ").trim();
  const safe = base.replace(/[^a-zA-Z0-9._ -]/g, "_");
  return safe.length ? safe : "item";
}

async function requireOwnedPack(packId: string, userId: string) {
  const pack = await prisma.pack.findUnique({
    where: { id: packId },
    select: { id: true, ownerId: true, parentId: true, name: true },
  });

  if (!pack) {
    throw new HTTPException(404, { message: "Pack not found" });
  }

  if (pack.ownerId !== userId) {
    throw new HTTPException(403, { message: "Only the owner can update this pack" });
  }

  return pack;
}

async function isSampleInCollection(userId: string, sampleId: string): Promise<boolean> {
  const existing = await prisma.sampleCollection.findUnique({
    where: {
      userId_sampleId: {
        userId,
        sampleId,
      },
    },
    select: { id: true },
  });
  return Boolean(existing);
}

async function canReadSample(userId: string, sampleId: string): Promise<boolean> {
  if (isSampleInCollection(userId, sampleId)) return true;
  const packSample = await prisma.packSample.findFirst({
    where: { sampleId, OR: [{ ownerId: userId }, { credits: 0 }] },
    select: { packId: true },
  });
  if (packSample) return true;
  const pack = await prisma.pack.findFirst({
    where: { packSamples: { some: { sampleId } }, ownerId: userId },
    select: { id: true },
  });
  return Boolean(pack);
}

type PackPathNode = { id: string; name: string; parentId: string | null; relativeDir: string };

async function loadPackTree(rootPackId: string): Promise<Map<string, PackPathNode>> {
  const root = await prisma.pack.findUnique({
    where: { id: rootPackId },
    select: { id: true, name: true, parentId: true },
  });
  if (!root) return new Map();

  const map = new Map<string, PackPathNode>();
  map.set(root.id, { id: root.id, name: root.name, parentId: root.parentId, relativeDir: "" });

  let frontier: string[] = [root.id];
  while (frontier.length) {
    const children = await prisma.pack.findMany({
      where: { parentId: { in: frontier } },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: "asc" },
    });

    for (const child of children) {
      const parent = child.parentId ? map.get(child.parentId) : null;
      const relativeDir = parent?.relativeDir ? `${parent.relativeDir}/${child.name}` : child.name;
      map.set(child.id, {
        id: child.id,
        name: child.name,
        parentId: child.parentId,
        relativeDir,
      });
    }

    frontier = children.map((child) => child.id);
  }

  return map;
}

const unsplashRandomSchema = z.object({
  query: z.string().trim().max(100).optional().default("music"),
  _: z.string().optional(), // cache-bust param from client, ignored
});

libraryApp.get("/unsplash/random-photo", zValidator("query", unsplashRandomSchema), async (c) => {
  const accessKey = process.env.UNSPLASH_ACCESS_KEY;
  if (!accessKey) {
    throw new HTTPException(503, { message: "Unsplash is not configured" });
  }
  const { query } = c.req.valid("query");
  const searchTerm = query || "music";
  const headers: Record<string, string> = {
    "Accept-Version": "v1",
    Authorization: `Client-ID ${accessKey}`,
  };

  type UnsplashPhoto = { urls?: { regular?: string } };
  let imageUrl: string | undefined;

  // Try /photos/random first (can return 404 when query has no matches)
  const randomParams = new URLSearchParams({
    query: searchTerm,
    orientation: "squarish",
  });
  const randomRes = await tracedFetch(
    `https://api.unsplash.com/photos/random?${randomParams}`,
    { headers },
    { service: "unsplash", operation: "photos/random" },
  );

  if (randomRes.ok) {
    const data = (await randomRes.json()) as UnsplashPhoto;
    imageUrl = data.urls?.regular;
  }

  // Fallback: use /search/photos when random returns 404 or no results
  if (!imageUrl) {
    const searchParams = new URLSearchParams({
      query: searchTerm,
      per_page: "15",
      orientation: "squarish",
    });
    const searchRes = await tracedFetch(
      `https://api.unsplash.com/search/photos?${searchParams}`,
      { headers },
      { service: "unsplash", operation: "search/photos" },
    );
    if (!searchRes.ok) {
      const text = await searchRes.text();
      throw new HTTPException(502, {
        message: `Unsplash API error: ${searchRes.status} ${text.slice(0, 200)}`,
      });
    }
    const searchData = (await searchRes.json()) as { results?: UnsplashPhoto[] };
    const results = searchData.results ?? [];
    if (results.length === 0) {
      // Last resort: random photo with broad query
      const fallbackRes = await tracedFetch(
        "https://api.unsplash.com/photos/random?orientation=squarish",
        { headers },
        { service: "unsplash", operation: "photos/random-fallback" },
      );
      if (!fallbackRes.ok) {
        const text = await fallbackRes.text();
        throw new HTTPException(502, {
          message: `Unsplash API error: ${fallbackRes.status} ${text.slice(0, 200)}`,
        });
      }
      const fallbackData = (await fallbackRes.json()) as UnsplashPhoto;
      imageUrl = fallbackData.urls?.regular;
    } else {
      const pick = results[Math.floor(Math.random() * results.length)];
      imageUrl = pick.urls?.regular;
    }
  }

  if (!imageUrl) {
    throw new HTTPException(502, { message: "Invalid Unsplash response" });
  }

  const imgRes = await tracedFetch(
    imageUrl,
    undefined,
    { service: "unsplash", operation: "image-download" },
  );
  if (!imgRes.ok) {
    throw new HTTPException(502, { message: "Failed to fetch image from Unsplash" });
  }
  const buf = await imgRes.arrayBuffer();
  return c.body(buf, 200, {
    "Content-Type": "image/jpeg",
    "Cache-Control": "no-store", // each dice roll should fetch fresh
  });
});

libraryApp.get("/search", zValidator("query", searchSchema), async (c) => {
  const user = c.get("user");
  const { q, scope, types, limit } = c.req.valid("query");
  const query = q.trim();

  const packNameFilter = query.length
    ? {
        name: {
          contains: query,
          mode: "insensitive" as const,
        },
      }
    : {};

  const sampleNameFilter = query.length
    ? {
        name: {
          contains: query,
          mode: "insensitive" as const,
        },
      }
    : {};

  const packOwnerFilter =
    scope === "mine" ? { ownerId: user.id } : scope === "explore" ? { ownerId: { not: user.id } } : {};

  const [packs, samples] = await Promise.all([
    types === "samples"
      ? Promise.resolve([])
      : prisma.pack.findMany({
          where: {
            ...packOwnerFilter,
            parentId: null,
            ...packNameFilter,
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
          select: {
            id: true,
            name: true,
            ownerId: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: {
                children: true,
                packSamples: true,
              },
            },
          },
        }),
    types === "packs"
      ? Promise.resolve([])
      : prisma.packSample.findMany({
          where: {
            ...(scope === "mine" ? { ownerId: user.id } : scope === "explore" ? { ownerId: { not: user.id } } : {}),
            ...sampleNameFilter,
          },
          include: {
            pack: { select: { id: true, name: true } },
            sample: { select: { sizeBytes: true, contentType: true } },
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
        }),
  ]);

  const sampleIds = samples.map((s) => s.sampleId);
  const collectionRows =
    sampleIds.length > 0
      ? await prisma.sampleCollection.findMany({
          where: {
            userId: user.id,
            sampleId: { in: sampleIds },
          },
          select: { sampleId: true },
        })
      : [];
  const inCollection = new Set(collectionRows.map((row) => row.sampleId));

  return c.json({
    packs: packs.map((pack) => ({
      id: pack.id,
      name: pack.name,
      ownerId: pack.ownerId,
      isOwner: pack.ownerId === user.id,
      createdAt: pack.createdAt,
      updatedAt: pack.updatedAt,
      childPackCount: pack._count.children,
      sampleCount: pack._count.packSamples,
    })),
    samples: samples.map((ps) => {
      const content = ps.sample;
      const readable = ps.ownerId === user.id || ps.credits === 0 || inCollection.has(ps.sampleId);
      return {
        id: ps.sampleId,
        name: ps.name,
        ownerId: ps.ownerId,
        packId: ps.packId,
        packName: ps.pack.name,
        credits: ps.credits,
        sizeBytes: content?.sizeBytes ?? null,
        contentType: content?.contentType ?? "application/octet-stream",
        isOwner: ps.ownerId === user.id,
        inCollection: inCollection.has(ps.sampleId),
        canDownload: readable,
        createdAt: ps.createdAt,
        updatedAt: ps.updatedAt,
      };
    }),
  });
});

libraryApp.post("/packs", zValidator("json", createPackSchema), async (c) => {
  const user = c.get("user");
  const { name, parentId, isPublic, priceTokens, defaultSampleTokens } = c.req.valid("json");

  if (parentId) {
    await requireOwnedPack(parentId, user.id);
  }

  const pack = await prisma.pack.create({
    data: {
      name: normalizeName(name),
      ownerId: user.id,
      parentId: parentId ?? null,
      isPublic,
      priceTokens,
      defaultSampleTokens,
    },
    select: {
      id: true,
      name: true,
      ownerId: true,
      parentId: true,
      isPublic: true,
      priceTokens: true,
      defaultSampleTokens: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json(pack, 201);
});

libraryApp.patch("/packs/:id", zValidator("json", updatePackSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { name, parentId, coverImageS3Key, isPublic, priceTokens, defaultSampleTokens } = c.req.valid("json");

  await requireOwnedPack(id, user.id);

  if (parentId === id) {
    throw new HTTPException(400, { message: "Pack cannot be its own parent" });
  }

  if (parentId) {
    await requireOwnedPack(parentId, user.id);
  }

  const pack = await prisma.pack.update({
    where: { id },
    data: {
      ...(name ? { name: normalizeName(name) } : {}),
      ...(parentId !== undefined ? { parentId } : {}),
      ...(coverImageS3Key !== undefined ? { coverImageS3Key } : {}),
      ...(isPublic !== undefined ? { isPublic } : {}),
      ...(priceTokens !== undefined ? { priceTokens } : {}),
      ...(defaultSampleTokens !== undefined ? { defaultSampleTokens } : {}),
    },
    select: {
      id: true,
      name: true,
      ownerId: true,
      parentId: true,
      coverImageS3Key: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json(pack);
});

libraryApp.post(
  "/packs/:id/cover-upload-url",
  zValidator("json", packCoverUploadSchema),
  async (c) => {
    const user = c.get("user");
    const id = c.req.param("id");
    const { contentType } = c.req.valid("json");

    await requireOwnedPack(id, user.id);

    const key = `packs/${user.id}/${id}/cover-${Date.now()}.${contentType.includes("png") ? "png" : "jpg"}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return c.json({ key, uploadUrl, expiresIn: 3600 });
  }
);

libraryApp.get("/packs/:id/contents", async (c) => {
  const user = c.get("user");
  const packId = c.req.param("id");

  const pack = await prisma.pack.findUnique({
    where: { id: packId },
    select: { id: true, name: true, ownerId: true },
  });
  if (!pack) {
    throw new HTTPException(404, { message: "Pack not found" });
  }

  const [childPacks, packSamples] = await Promise.all([
    prisma.pack.findMany({
      where: { parentId: packId },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        ownerId: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { children: true, packSamples: true } },
      },
    }),
    prisma.packSample.findMany({
      where: { packId },
      include: {
        sample: { select: { sizeBytes: true, contentType: true } },
      },
      orderBy: { name: "asc" },
    }),
  ]);

  const sampleIds = packSamples.map((ps) => ps.sampleId);
  const collectionRows =
    sampleIds.length > 0
      ? await prisma.sampleCollection.findMany({
          where: { userId: user.id, sampleId: { in: sampleIds } },
          select: { sampleId: true },
        })
      : [];
  const inCollection = new Set(collectionRows.map((row) => row.sampleId));

  return c.json({
    pack: {
      id: pack.id,
      name: pack.name,
      ownerId: pack.ownerId,
      isOwner: pack.ownerId === user.id,
    },
    packs: childPacks.map((p) => ({
      id: p.id,
      name: p.name,
      ownerId: p.ownerId,
      isOwner: p.ownerId === user.id,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      childPackCount: p._count.children,
      sampleCount: p._count.packSamples,
    })),
    samples: packSamples.map((ps) => {
      const content = ps.sample;
      const readable = ps.ownerId === user.id || ps.credits === 0 || inCollection.has(ps.sampleId);
      return {
        id: ps.sampleId,
        name: ps.name,
        ownerId: ps.ownerId,
        packId: ps.packId,
        packName: pack.name,
        credits: ps.credits,
        sizeBytes: content?.sizeBytes ?? null,
        contentType: content?.contentType ?? "application/octet-stream",
        isOwner: ps.ownerId === user.id,
        inCollection: inCollection.has(ps.sampleId),
        canDownload: readable,
        createdAt: ps.createdAt,
        updatedAt: ps.updatedAt,
      };
    }),
  });
});

libraryApp.get("/packs/:id/cover", async (c) => {
  const _user = c.get("user");
  const id = c.req.param("id");

  const pack = await prisma.pack.findUnique({
    where: { id },
    select: { coverImageS3Key: true },
  });
  if (!pack || !pack.coverImageS3Key) {
    throw new HTTPException(404, { message: "Pack cover not found" });
  }

  const buf = await getFromS3(pack.coverImageS3Key);
  if (!buf) {
    throw new HTTPException(404, { message: "Cover image not found" });
  }

  const ext = pack.coverImageS3Key.split(".").pop()?.toLowerCase();
  const contentType = ext === "png" ? "image/png" : "image/jpeg";
  return c.body(buf, 200, {
    "Content-Type": contentType,
    "Cache-Control": "private, max-age=3600",
  });
});

libraryApp.get("/packs/:id", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const pack = await prisma.pack.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      ownerId: true,
      coverImageS3Key: true,
      isPublic: true,
      priceTokens: true,
      defaultSampleTokens: true,
      _count: { select: { children: true, packSamples: true } },
      owner: { select: { name: true } },
    },
  });
  if (!pack) {
    throw new HTTPException(404, { message: "Pack not found" });
  }

  let coverImageUrl: string | null = null;
  let coverImageProxyUrl: string | null = null;
  if (pack.coverImageS3Key) {
    coverImageUrl = await getPresignedDownloadUrl(pack.coverImageS3Key, 3600);
    coverImageProxyUrl = `/api/library/packs/${encodeURIComponent(id)}/cover`;
  }

  return c.json({
    id: pack.id,
    name: pack.name,
    ownerId: pack.ownerId,
    ownerName: pack.owner.name,
    isOwner: pack.ownerId === user.id,
    coverImageS3Key: pack.coverImageS3Key,
    coverImageUrl,
    coverImageProxyUrl,
    isPublic: pack.isPublic,
    priceTokens: pack.priceTokens,
    defaultSampleTokens: pack.defaultSampleTokens,
    childPackCount: pack._count.children,
    sampleCount: pack._count.packSamples,
  });
});

libraryApp.get("/packs/:id/download-manifest", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const pack = await prisma.pack.findUnique({
    where: { id },
    select: { id: true, name: true, ownerId: true },
  });
  if (!pack) {
    throw new HTTPException(404, { message: "Pack not found" });
  }

  const tree = await loadPackTree(pack.id);
  const packIds = Array.from(tree.keys());

  const packSamples =
    packIds.length === 0
      ? []
      : await prisma.packSample.findMany({
          where: { packId: { in: packIds } },
          include: {
            sample: { select: { sizeBytes: true, contentType: true } },
          },
          orderBy: [{ packId: "asc" }, { name: "asc" }],
        });

  const sampleIds = packSamples.map((ps) => ps.sampleId);
  const collectionRows =
    sampleIds.length > 0
      ? await prisma.sampleCollection.findMany({
          where: {
            userId: user.id,
            sampleId: { in: sampleIds },
          },
          select: { sampleId: true },
        })
      : [];
  const inCollection = new Set(collectionRows.map((row) => row.sampleId));

  const downloadable = packSamples.filter(
    (ps) =>
      ps.ownerId === user.id || ps.credits === 0 || inCollection.has(ps.sampleId) || pack.ownerId === user.id,
  );

  if (downloadable.length === 0) {
    throw new HTTPException(403, { message: "No downloadable samples in this pack for current user" });
  }

  return c.json({
    pack: {
      id: pack.id,
      name: pack.name,
      ownerId: pack.ownerId,
      isOwner: pack.ownerId === user.id,
    },
    samples: downloadable.map((ps) => {
      const content = ps.sample;
      const dir = tree.get(ps.packId)?.relativeDir ?? "";
      const relativePath = dir ? `${dir}/${ps.name}` : ps.name;
      return {
        id: ps.sampleId,
        name: ps.name,
        relativePath,
        packId: ps.packId,
        credits: ps.credits,
        sizeBytes: content?.sizeBytes ?? null,
        contentType: content?.contentType ?? "application/octet-stream",
      };
    }),
  });
});

libraryApp.route("/samples/search", sampleSearchApp);

libraryApp.post("/samples/check-exist", zValidator("json", checkSamplesExistSchema), async (c) => {
  const { contentHashes } = c.req.valid("json");
  const existing = await prisma.sample.findMany({
    where: { id: { in: contentHashes } },
    select: { id: true },
  });
  const existingSet = new Set(existing.map((e) => e.id));
  const missing = contentHashes.filter((h) => !existingSet.has(h));
  return c.json({ existing: Array.from(existingSet), missing });
});

function contentTypeToExt(contentType: string): string {
  const map: Record<string, string> = {
    "audio/wav": "wav",
    "audio/wave": "wav",
    "audio/x-wav": "wav",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/flac": "flac",
    "audio/ogg": "ogg",
    "audio/aiff": "aiff",
    "audio/aif": "aif",
  };
  return map[contentType.toLowerCase()] ?? "bin";
}

libraryApp.post("/samples/upload-url-by-content", zValidator("json", uploadByContentHashSchema), async (c) => {
  const user = c.get("user");
  const { packId, contentHash, contentType } = c.req.valid("json");
  await requireOwnedPack(packId, user.id);
  const ext = contentTypeToExt(contentType);
  const key = `samples/${contentHash}.${ext}`;
  const uploadUrl = await getPresignedUploadUrl(key, contentType);
  return c.json({ key, uploadUrl, expiresIn: 3600 });
});

libraryApp.post("/samples/from-content", zValidator("json", createSampleFromContentSchema), async (c) => {
  const user = c.get("user");
  const { packId, name, contentHash, contentType, sizeBytes, credits } = c.req.valid("json");
  const pack = await requireOwnedPack(packId, user.id);

  const ext = contentTypeToExt(contentType);
  const s3Key = `samples/${contentHash}.${ext}`;

  const created = await prisma.sample.upsert({
    where: { id: contentHash },
    create: {
      id: contentHash,
      s3Key,
      contentType,
      sizeBytes: sizeBytes ?? null,
    },
    update: {},
  });

  // Enqueue analysis for new samples (or re-analyze if PENDING/FAILED)
  if (
    created.analysisStatus === "PENDING" ||
    created.analysisStatus === "FAILED"
  ) {
    try {
      const jobId = await enqueueSampleAnalysis(created.id, created.s3Key);
      console.log(`[library] Enqueued sample analysis job ${jobId ?? "unknown"} for sample ${created.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[library] Failed to enqueue sample analysis:", err);
      await prisma.sample.update({
        where: { id: created.id },
        data: {
          analysisStatus: "FAILED",
          analysisError: `Failed to queue analysis: ${message}`,
        },
      });
    }
  }

  const ps = await prisma.packSample.upsert({
    where: { packId_sampleId: { packId: pack.id, sampleId: contentHash } },
    create: {
      packId: pack.id,
      sampleId: contentHash,
      name: normalizeName(name),
      ownerId: user.id,
      credits,
    },
    update: {},
    include: {
      sample: { select: { sizeBytes: true, contentType: true } },
    },
  });

  return c.json(
    {
      id: ps.sampleId,
      name: ps.name,
      packId: ps.packId,
      ownerId: ps.ownerId,
      credits: ps.credits,
      sizeBytes: ps.sample?.sizeBytes ?? null,
      contentType: ps.sample?.contentType ?? "application/octet-stream",
      createdAt: ps.createdAt,
      updatedAt: ps.updatedAt,
    },
    201
  );
});

libraryApp.post("/samples/upload-url", zValidator("json", uploadSampleSchema), async (c) => {
  const user = c.get("user");
  const { packId, fileName, contentType, credits, sizeBytes } = c.req.valid("json");
  const pack = await requireOwnedPack(packId, user.id);
  const safeFileName = sanitizePathSegment(fileName);
  const key = `samples/${user.id}/${pack.id}/${Date.now()}-${safeFileName}`;
  const uploadUrl = await getPresignedUploadUrl(key, contentType);

  return c.json({
    key,
    uploadUrl,
    expiresIn: 3600,
    suggestedSample: {
      name: safeFileName,
      packId: pack.id,
      ownerId: user.id,
      contentType,
      credits,
      sizeBytes: sizeBytes ?? null,
    },
  });
});

libraryApp.post("/samples", zValidator("json", createSampleSchema), async (c) => {
  const user = c.get("user");
  const { packId, name, s3Key, contentType, sizeBytes, credits } = c.req.valid("json");
  const pack = await requireOwnedPack(packId, user.id);

  const keyPrefix = `samples/${user.id}/${pack.id}/`;
  if (!s3Key.startsWith(keyPrefix)) {
    throw new HTTPException(400, { message: "Invalid s3Key for current owner/pack" });
  }

  const legacyContentId = `legacy_${crypto.randomUUID().replace(/-/g, "")}`;
  const created = await prisma.sample.create({
    data: {
      id: legacyContentId,
      s3Key,
      contentType,
      sizeBytes: sizeBytes ?? null,
    },
  });
  try {
    const jobId = await enqueueSampleAnalysis(created.id, created.s3Key);
    console.log(`[library] Enqueued sample analysis job ${jobId ?? "unknown"} for sample ${created.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[library] Failed to enqueue sample analysis:", err);
    await prisma.sample.update({
      where: { id: created.id },
      data: {
        analysisStatus: "FAILED",
        analysisError: `Failed to queue analysis: ${message}`,
      },
    });
  }

  const ps = await prisma.packSample.create({
    data: {
      packId: pack.id,
      sampleId: legacyContentId,
      name: normalizeName(name),
      ownerId: user.id,
      credits,
    },
    include: {
      sample: { select: { sizeBytes: true, contentType: true } },
    },
  });

  return c.json(
    {
      id: ps.sampleId,
      name: ps.name,
      packId: ps.packId,
      ownerId: ps.ownerId,
      credits: ps.credits,
      sizeBytes: ps.sample?.sizeBytes ?? null,
      contentType: ps.sample?.contentType ?? "application/octet-stream",
      createdAt: ps.createdAt,
      updatedAt: ps.updatedAt,
    },
    201
  );
});

const updatePackSampleSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  credits: z.number().int().min(0).optional(),
});

libraryApp.patch("/packs/:packId/samples/:sampleId", zValidator("json", updatePackSampleSchema), async (c) => {
  const user = c.get("user");
  const packId = c.req.param("packId");
  const sampleId = c.req.param("sampleId");
  const { name, credits } = c.req.valid("json");

  const ps = await prisma.packSample.findUnique({
    where: { packId_sampleId: { packId, sampleId } },
    select: { ownerId: true },
  });
  if (!ps) {
    throw new HTTPException(404, { message: "Sample not found in pack" });
  }
  if (ps.ownerId !== user.id) {
    throw new HTTPException(403, { message: "Only the owner can update this sample" });
  }

  const updated = await prisma.packSample.update({
    where: { packId_sampleId: { packId, sampleId } },
    data: {
      ...(name ? { name: normalizeName(name) } : {}),
      ...(credits !== undefined ? { credits } : {}),
    },
    include: {
      sample: { select: { sizeBytes: true, contentType: true } },
    },
  });

  return c.json({
    id: updated.sampleId,
    name: updated.name,
    packId: updated.packId,
    ownerId: updated.ownerId,
    credits: updated.credits,
    sizeBytes: updated.sample?.sizeBytes ?? null,
    contentType: updated.sample?.contentType ?? "application/octet-stream",
    createdAt: updated.createdAt,
    updatedAt: updated.updatedAt,
  });
});

libraryApp.post("/samples/:id/add-to-collection", async (c) => {
  const user = c.get("user");
  const sampleId = c.req.param("id");

  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: { id: true },
  });
  if (!sample) {
    throw new HTTPException(404, { message: "Sample not found" });
  }

  const packSample = await prisma.packSample.findFirst({
    where: { sampleId },
    select: { credits: true },
  });
  const creditsPaid = packSample?.credits ?? 0;

  const item = await prisma.sampleCollection.upsert({
    where: {
      userId_sampleId: {
        userId: user.id,
        sampleId,
      },
    },
    update: {},
    create: {
      userId: user.id,
      sampleId,
      creditsPaid,
    },
    select: {
      id: true,
      userId: true,
      sampleId: true,
      creditsPaid: true,
      createdAt: true,
    },
  });

  return c.json(item, 201);
});

libraryApp.get("/samples/:id/analysis", async (c) => {
  const user = c.get("user");
  const sampleId = c.req.param("id");

  const readable = await canReadSample(user.id, sampleId);
  if (!readable) {
    throw new HTTPException(403, { message: "You do not have access to this sample" });
  }

  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: {
      id: true,
      analysisStatus: true,
      analysisError: true,
      durationMs: true,
      sampleRate: true,
      channels: true,
      attributes: { select: { key: true, value: true } },
      annotations: {
        include: {
          taxonomyValue: {
            include: { attribute: { select: { key: true } } },
          },
        },
      },
      embeddings: { select: { model: true, modelVersion: true, dimensions: true } },
    },
  });
  if (!sample) {
    throw new HTTPException(404, { message: "Sample not found" });
  }

  const attributes: Record<string, number> = {};
  for (const a of sample.attributes) attributes[a.key] = a.value;

  const taxonomy: Array<{ attribute: string; value: string; confidence: number }> = [];
  for (const ann of sample.annotations) {
    taxonomy.push({
      attribute: ann.taxonomyValue.attribute.key,
      value: ann.taxonomyValue.key,
      confidence: ann.confidence,
    });
  }

  const embeddings = sample.embeddings.map((e) => ({
    model: e.model,
    modelVersion: e.modelVersion,
    dimensions: e.dimensions,
  }));

  return c.json({
    id: sample.id,
    analysisStatus: sample.analysisStatus,
    analysisError: sample.analysisError,
    durationMs: sample.durationMs,
    sampleRate: sample.sampleRate,
    channels: sample.channels,
    attributes,
    taxonomy,
    embeddings,
  });
});

libraryApp.post("/samples/:id/analysis/retry", async (c) => {
  const user = c.get("user");
  const sampleId = c.req.param("id");

  const readable = await canReadSample(user.id, sampleId);
  if (!readable) {
    throw new HTTPException(403, { message: "You do not have access to this sample" });
  }

  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: { id: true, s3Key: true, analysisStatus: true },
  });
  if (!sample) {
    throw new HTTPException(404, { message: "Sample not found" });
  }

  if (sample.analysisStatus === "PROCESSING") {
    throw new HTTPException(409, { message: "Analysis is already processing" });
  }

  await prisma.sample.update({
    where: { id: sample.id },
    data: {
      analysisStatus: "PENDING",
      analysisError: null,
    },
  });

  try {
    const jobId = await enqueueSampleAnalysis(sample.id, sample.s3Key);
    console.log(`[library] Enqueued sample analysis job ${jobId ?? "unknown"} for sample ${sample.id}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[library] Failed to enqueue sample analysis:", err);
    await prisma.sample.update({
      where: { id: sample.id },
      data: {
        analysisStatus: "FAILED",
        analysisError: `Failed to queue analysis: ${message}`,
      },
    });
    throw new HTTPException(503, { message: "Failed to queue analysis. Please retry." });
  }

  return c.json({ ok: true });
});

libraryApp.get("/samples/:id/download", async (c) => {
  const user = c.get("user");
  const sampleId = c.req.param("id");

  const sample = await prisma.sample.findUnique({
    where: { id: sampleId },
    select: { s3Key: true, contentType: true },
  });
  if (!sample) {
    throw new HTTPException(404, { message: "Sample not found" });
  }

  const readable = await canReadSample(user.id, sampleId);
  if (!readable) {
    throw new HTTPException(403, { message: "You do not have access to download this sample" });
  }

  const payload = await getFromS3(sample.s3Key);
  if (!payload) {
    throw new HTTPException(404, { message: "Sample file not found in storage" });
  }

  const packSample = await prisma.packSample.findFirst({
    where: { sampleId },
    select: { name: true },
  });
  const displayName = packSample?.name ?? "sample";

  const body = new Uint8Array(payload.length);
  body.set(payload);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": sample.contentType || "application/octet-stream",
      "Content-Length": String(payload.length),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(displayName)}"`,
    },
  });
});

export { libraryApp };
