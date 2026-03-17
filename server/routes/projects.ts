import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { requireUser } from "../middleware/auth-guard.js";
import { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../db.js";
import { getFromS3, getPresignedUploadUrl } from "../s3.js";

const projectsApp = new Hono<{ Variables: AppVariables }>();

const projectCoverUploadSchema = z.object({
  contentType: z.string().trim().min(1).default("image/jpeg"),
});

const stackSchema = z.object({
  id: z.string().trim().min(1),
  name: z.string(),
  sortOrder: z.number().int(),
  slots: z.array(z.unknown()),
  activeSlotIndex: z.number().int().min(0),
  previewMode: z.string(),
  bpmAuto: z.boolean(),
  globalTempoBpm: z.number().int().min(1).max(999),
});

const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  coverImageS3Key: z.string().trim().min(1).nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
  isPublic: z.boolean().optional(),
  activeStackId: z.string().trim().nullable().optional(),
  stacks: z.array(stackSchema).optional(),
  sampleEdits: z.record(z.string(), z.unknown()).optional(),
  timeSignature: z
    .object({
      num: z.number().int().min(1),
      denom: z.number().int().min(1),
    })
    .nullable()
    .optional(),
  transportDefaults: z
    .object({
      volume: z.number(),
      muted: z.boolean(),
    })
    .nullable()
    .optional(),
  arrangementMetadata: z.unknown().optional(),
  formatSettings: z.record(z.string(), z.unknown()).nullable().optional(),
});

function projectToJson(project: {
  id: string;
  name: string;
  coverImageS3Key: string | null;
  coverImageUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  isPublic: boolean;
  activeStackId: string | null;
  sampleEdits: unknown;
  timeSignature: unknown;
  transportDefaults: unknown;
  arrangementMetadata: unknown;
  formatSettings: unknown;
  stacks: Array<{
    id: string;
    name: string;
    sortOrder: number;
    slots: unknown;
    activeSlotIndex: number;
    previewMode: string;
    bpmAuto: boolean;
    globalTempoBpm: number;
  }>;
}) {
  return {
    id: project.id,
    name: project.name,
    coverImageS3Key: project.coverImageS3Key,
    coverImageUrl: project.coverImageUrl,
    createdAt: project.createdAt.getTime(),
    updatedAt: project.updatedAt.getTime(),
    isPublic: project.isPublic,
    activeStackId: project.activeStackId,
    stacks: project.stacks.map((s) => ({
      id: s.id,
      name: s.name,
      sortOrder: s.sortOrder,
      slots: s.slots,
      activeSlotIndex: s.activeSlotIndex,
      previewMode: s.previewMode,
      bpmAuto: s.bpmAuto,
      globalTempoBpm: s.globalTempoBpm,
    })),
    sampleEdits: project.sampleEdits as Record<string, unknown>,
    timeSignature: project.timeSignature as { num: number; denom: number } | null,
    transportDefaults: project.transportDefaults as { volume: number; muted: boolean } | null,
    arrangementMetadata: project.arrangementMetadata,
    formatSettings: project.formatSettings as Record<string, unknown> | null,
  };
}

/** GET /api/projects/me - Return current user's project (404 if none) */
projectsApp.get("/me", requireUser, async (c) => {
  const user = requireUser(c);
  const project = await prisma.project.findUnique({
    where: { userId: user.id },
    include: { stacks: { orderBy: { sortOrder: "asc" } } },
  });
  if (!project) {
    throw new HTTPException(404, { message: "Project not found" });
  }
  return c.json(projectToJson(project));
});

const createProjectSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
  })
  .optional()
  .default({});

const createNewProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  formatSettings: z.record(z.string(), z.unknown()).nullable().optional(),
});

/** POST /api/projects/new - Create new project with fresh state. Resets stack, cover, timeSignature, transportDefaults, arrangementMetadata. Preserves formatSettings from request. */
projectsApp.post("/new", requireUser, zValidator("json", createNewProjectSchema), async (c) => {
  const user = requireUser(c);
  const body = c.req.valid("json");
  console.log("[projects] POST /new", { userId: user.id, name: body?.name });
  const name = body?.name ?? "Untitled";
  const formatSettings = body?.formatSettings ?? null;

  const existing = await prisma.project.findUnique({
    where: { userId: user.id },
    include: { stacks: true },
  });

  const stackId = crypto.randomUUID();
  const emptySlots = [null, null, null, null] as Prisma.InputJsonValue;
  const freshStack = {
    id: stackId,
    name: "Stack 1",
    sortOrder: 0,
    slots: emptySlots,
    activeSlotIndex: 0,
    previewMode: "single",
    bpmAuto: true,
    globalTempoBpm: 120,
  };

  if (existing) {
    await prisma.projectStack.deleteMany({ where: { projectId: existing.id } });
    await prisma.projectStack.create({
      data: {
        ...freshStack,
        projectId: existing.id,
      },
    });
    const updated = await prisma.project.update({
      where: { id: existing.id },
      data: {
        name,
        coverImageS3Key: null,
        coverImageUrl: null,
        timeSignature: Prisma.DbNull,
        transportDefaults: Prisma.DbNull,
        arrangementMetadata: Prisma.DbNull,
        sampleEdits: {},
        formatSettings: formatSettings != null ? (formatSettings as Prisma.InputJsonValue) : Prisma.DbNull,
        activeStackId: stackId,
      },
      include: { stacks: { orderBy: { sortOrder: "asc" } } },
    });
    const json = projectToJson(updated as unknown as Parameters<typeof projectToJson>[0]);
    console.log("[projects] POST /new returning updated project", json.id);
    return c.json(json);
  }

  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name,
      activeStackId: stackId,
      formatSettings: formatSettings != null ? (formatSettings as Prisma.InputJsonValue) : undefined,
      stacks: {
        create: {
          ...freshStack,
        },
      },
    },
    include: { stacks: { orderBy: { sortOrder: "asc" } } },
  });
  const json = projectToJson(project as unknown as Parameters<typeof projectToJson>[0]);
  console.log("[projects] POST /new returning new project", json.id);
  return c.json(json);
});

/** POST /api/projects - Create project if none; return existing if present */
projectsApp.post("/", requireUser, zValidator("json", createProjectSchema), async (c) => {
  const user = requireUser(c);
  const existing = await prisma.project.findUnique({
    where: { userId: user.id },
  });
  if (existing) {
    const withStacks = await prisma.project.findUnique({
      where: { id: existing.id },
      include: { stacks: { orderBy: { sortOrder: "asc" } } },
    });
    if (withStacks) return c.json(projectToJson(withStacks));
  }
  const body = c.req.valid("json");
  const stackId = crypto.randomUUID();
  const project = await prisma.project.create({
    data: {
      userId: user.id,
      name: body?.name ?? "Untitled",
      activeStackId: stackId,
      stacks: {
        create: {
          id: stackId,
          name: "Stack 1",
          sortOrder: 0,
          slots: [],
          activeSlotIndex: 0,
          previewMode: "single",
          bpmAuto: true,
          globalTempoBpm: 120,
        },
      },
    },
    include: { stacks: { orderBy: { sortOrder: "asc" } } },
  });
  return c.json(projectToJson(project));
});

/** PUT /api/projects/:id - Update project (must own it) */
projectsApp.put(
  "/:id",
  requireUser,
  zValidator("param", z.object({ id: z.string().trim().min(1) })),
  zValidator("json", updateProjectSchema),
  async (c) => {
    const user = requireUser(c);
    const { id } = c.req.param();
    const body = c.req.valid("json");

    const project = await prisma.project.findUnique({
      where: { id },
      include: { stacks: true },
    });
    if (!project) {
      throw new HTTPException(404, { message: "Project not found" });
    }
    if (project.userId !== user.id) {
      throw new HTTPException(403, { message: "Not authorized to update this project" });
    }

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.coverImageS3Key !== undefined) data.coverImageS3Key = body.coverImageS3Key;
    if (body.coverImageUrl !== undefined) data.coverImageUrl = body.coverImageUrl;
    if (body.isPublic !== undefined) data.isPublic = body.isPublic;
    if (body.activeStackId !== undefined) data.activeStackId = body.activeStackId;
    if (body.sampleEdits !== undefined) data.sampleEdits = body.sampleEdits;
    if (body.timeSignature !== undefined) data.timeSignature = body.timeSignature;
    if (body.transportDefaults !== undefined) data.transportDefaults = body.transportDefaults;
    if (body.arrangementMetadata !== undefined) data.arrangementMetadata = body.arrangementMetadata;
    if (body.formatSettings !== undefined) data.formatSettings = body.formatSettings;

    if (body.stacks !== undefined) {
      await prisma.projectStack.deleteMany({ where: { projectId: id } });
      await prisma.projectStack.createMany({
        data: body.stacks.map(
          (s: {
            id: string;
            name: string;
            sortOrder: number;
            slots: unknown;
            activeSlotIndex: number;
            previewMode: string;
            bpmAuto: boolean;
            globalTempoBpm: number;
          }) => ({
            id: s.id,
            projectId: id,
            name: s.name,
            sortOrder: s.sortOrder,
            slots: s.slots as Prisma.InputJsonValue,
            activeSlotIndex: s.activeSlotIndex,
            previewMode: s.previewMode,
            bpmAuto: s.bpmAuto,
            globalTempoBpm: s.globalTempoBpm,
          }),
        ),
      });
    }

    const updated = await prisma.project.update({
      where: { id },
      data: data as Parameters<typeof prisma.project.update>[0]["data"],
      include: { stacks: { orderBy: { sortOrder: "asc" } } },
    });

    return c.json(projectToJson(updated));
  },
);

/** POST /api/projects/:id/cover-upload-url - Get presigned URL for cover upload */
projectsApp.post(
  "/:id/cover-upload-url",
  requireUser,
  zValidator("param", z.object({ id: z.string().trim().min(1) })),
  zValidator("json", projectCoverUploadSchema),
  async (c) => {
    const user = requireUser(c);
    const { id } = c.req.param();
    const { contentType } = c.req.valid("json");

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) throw new HTTPException(404, { message: "Project not found" });
    if (project.userId !== user.id) throw new HTTPException(403, { message: "Not authorized" });

    const key = `projects/${user.id}/${id}/cover-${Date.now()}.${contentType.includes("png") ? "png" : "jpg"}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return c.json({ key, uploadUrl, expiresIn: 3600 });
  },
);

/** GET /api/projects/:id/cover - Serve project cover image from S3 */
projectsApp.get(
  "/:id/cover",
  requireUser,
  zValidator("param", z.object({ id: z.string().trim().min(1) })),
  async (c) => {
    const user = requireUser(c);
    const { id } = c.req.param();

    const project = await prisma.project.findUnique({
      where: { id },
      select: { coverImageS3Key: true, userId: true },
    });
    if (!project || project.userId !== user.id || !project.coverImageS3Key) {
      throw new HTTPException(404, { message: "Project cover not found" });
    }

    const buf = await getFromS3(project.coverImageS3Key);
    if (!buf) throw new HTTPException(404, { message: "Cover image not found" });

    const ext = project.coverImageS3Key.split(".").pop()?.toLowerCase();
    const contentType = ext === "png" ? "image/png" : "image/jpeg";
    return c.body(new Uint8Array(buf), 200, {
      "Content-Type": contentType,
      "Cache-Control": "private, max-age=3600",
    });
  },
);

export { projectsApp };
