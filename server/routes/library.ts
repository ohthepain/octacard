import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { prisma } from "../db.js";
import { getFromS3, getPresignedUploadUrl } from "../s3.js";

const libraryApp = new Hono<{ Variables: AppVariables }>();

const searchSchema = z.object({
  q: z.string().trim().default(""),
  scope: z.enum(["mine", "all"]).default("all"),
  types: z.enum(["packs", "samples", "both"]).default("both"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

const createPackSchema = z.object({
  name: z.string().trim().min(1).max(120),
  parentId: z.string().trim().min(1).optional(),
});

const updatePackSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  parentId: z.string().trim().min(1).nullable().optional(),
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

const updateSampleSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  credits: z.number().int().min(0).optional(),
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

async function canReadSample(userId: string, sample: { id: string; ownerId: string; credits: number }): Promise<boolean> {
  if (sample.ownerId === userId) return true;
  if (sample.credits === 0) return true;
  return isSampleInCollection(userId, sample.id);
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

  const [packs, samples] = await Promise.all([
    types === "samples"
      ? Promise.resolve([])
      : prisma.pack.findMany({
          where: {
            ...(scope === "mine" ? { ownerId: user.id } : {}),
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
                samples: true,
              },
            },
          },
        }),
    types === "packs"
      ? Promise.resolve([])
      : prisma.sampleFile.findMany({
          where: {
            ...(scope === "mine" ? { ownerId: user.id } : {}),
            ...sampleNameFilter,
          },
          include: {
            pack: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: limit,
        }),
  ]);

  const sampleIds = samples.map((sample) => sample.id);
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
      sampleCount: pack._count.samples,
    })),
    samples: samples.map((sample) => {
      const readable = sample.ownerId === user.id || sample.credits === 0 || inCollection.has(sample.id);
      return {
        id: sample.id,
        name: sample.name,
        ownerId: sample.ownerId,
        packId: sample.packId,
        packName: sample.pack.name,
        credits: sample.credits,
        sizeBytes: sample.sizeBytes,
        contentType: sample.contentType,
        isOwner: sample.ownerId === user.id,
        inCollection: inCollection.has(sample.id),
        canDownload: readable,
        createdAt: sample.createdAt,
        updatedAt: sample.updatedAt,
      };
    }),
  });
});

libraryApp.post("/packs", zValidator("json", createPackSchema), async (c) => {
  const user = c.get("user");
  const { name, parentId } = c.req.valid("json");

  if (parentId) {
    await requireOwnedPack(parentId, user.id);
  }

  const pack = await prisma.pack.create({
    data: {
      name: normalizeName(name),
      ownerId: user.id,
      parentId: parentId ?? null,
    },
    select: {
      id: true,
      name: true,
      ownerId: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json(pack, 201);
});

libraryApp.patch("/packs/:id", zValidator("json", updatePackSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { name, parentId } = c.req.valid("json");

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
    },
    select: {
      id: true,
      name: true,
      ownerId: true,
      parentId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json(pack);
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

  const samples =
    packIds.length === 0
      ? []
      : await prisma.sampleFile.findMany({
          where: { packId: { in: packIds } },
          select: {
            id: true,
            name: true,
            ownerId: true,
            packId: true,
            credits: true,
            sizeBytes: true,
            contentType: true,
          },
          orderBy: [{ packId: "asc" }, { name: "asc" }],
        });

  const sampleIds = samples.map((sample) => sample.id);
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

  const downloadable = samples.filter(
    (sample) =>
      sample.ownerId === user.id || sample.credits === 0 || inCollection.has(sample.id) || pack.ownerId === user.id,
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
    samples: downloadable.map((sample) => {
      const dir = tree.get(sample.packId)?.relativeDir ?? "";
      const relativePath = dir ? `${dir}/${sample.name}` : sample.name;
      return {
        id: sample.id,
        name: sample.name,
        relativePath,
        packId: sample.packId,
        credits: sample.credits,
        sizeBytes: sample.sizeBytes,
        contentType: sample.contentType,
      };
    }),
  });
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

  const sample = await prisma.sampleFile.create({
    data: {
      name: normalizeName(name),
      packId: pack.id,
      ownerId: user.id,
      s3Key,
      contentType,
      sizeBytes: sizeBytes ?? null,
      credits,
    },
    select: {
      id: true,
      name: true,
      packId: true,
      ownerId: true,
      credits: true,
      sizeBytes: true,
      contentType: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json(sample, 201);
});

libraryApp.patch("/samples/:id", zValidator("json", updateSampleSchema), async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");
  const { name, credits } = c.req.valid("json");

  const sample = await prisma.sampleFile.findUnique({
    where: { id },
    select: { id: true, ownerId: true },
  });
  if (!sample) {
    throw new HTTPException(404, { message: "Sample not found" });
  }
  if (sample.ownerId !== user.id) {
    throw new HTTPException(403, { message: "Only the owner can update this sample" });
  }

  const updated = await prisma.sampleFile.update({
    where: { id },
    data: {
      ...(name ? { name: normalizeName(name) } : {}),
      ...(credits !== undefined ? { credits } : {}),
    },
    select: {
      id: true,
      name: true,
      packId: true,
      ownerId: true,
      credits: true,
      sizeBytes: true,
      contentType: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return c.json(updated);
});

libraryApp.post("/samples/:id/add-to-collection", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const sample = await prisma.sampleFile.findUnique({
    where: { id },
    select: { id: true, credits: true },
  });
  if (!sample) {
    throw new HTTPException(404, { message: "Sample not found" });
  }

  const item = await prisma.sampleCollection.upsert({
    where: {
      userId_sampleId: {
        userId: user.id,
        sampleId: sample.id,
      },
    },
    update: {},
    create: {
      userId: user.id,
      sampleId: sample.id,
      creditsPaid: sample.credits,
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

libraryApp.get("/samples/:id/download", async (c) => {
  const user = c.get("user");
  const id = c.req.param("id");

  const sample = await prisma.sampleFile.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      ownerId: true,
      s3Key: true,
      contentType: true,
      credits: true,
    },
  });
  if (!sample) {
    throw new HTTPException(404, { message: "Sample not found" });
  }

  const readable = await canReadSample(user.id, sample);
  if (!readable) {
    throw new HTTPException(403, { message: "You do not have access to download this sample" });
  }

  const payload = await getFromS3(sample.s3Key);
  if (!payload) {
    throw new HTTPException(404, { message: "Sample file not found in storage" });
  }
  const body = new Uint8Array(payload.length);
  body.set(payload);

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": sample.contentType || "application/octet-stream",
      "Content-Length": String(payload.length),
      "Content-Disposition": `attachment; filename="${encodeURIComponent(sample.name)}"`,
    },
  });
});

export { libraryApp };
