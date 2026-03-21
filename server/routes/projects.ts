import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { requireUser, requireUserMiddleware } from "../middleware/auth-guard.js";
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

const createProjectPackSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

const updateProjectPackSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  coverImageS3Key: z.string().trim().min(1).nullable().optional(),
  coverImageUrl: z.string().url().nullable().optional(),
});

const packFolderSchema = z.object({
  id: z.string().trim().min(1),
  parentId: z.string().trim().nullable(),
  name: z.string().trim().min(1),
  sortOrder: z.number().int().min(0),
});

const packEntrySchema = z.object({
  id: z.string().trim().min(1),
  folderId: z.string().trim().nullable(),
  displayName: z.string().trim().min(1),
  sourceRef: z.string().trim().min(1),
  regionStart: z.number().finite(),
  regionEnd: z.number().finite(),
  sortOrder: z.number().int().min(0),
});

const packStructureSchema = z.object({
  folders: z.array(packFolderSchema),
  entries: z.array(packEntrySchema),
});

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Packs are tied to the project id in the URL; must exist and belong to the user. */
async function resolveProjectIdForPackRoutes(
  urlProjectId: string,
  userId: string,
): Promise<{ status: "ok"; projectId: string } | { status: "foreign" } | { status: "none" }> {
  const row = await prisma.project.findUnique({
    where: { id: urlProjectId },
    select: { id: true, userId: true },
  });
  if (!row) return { status: "none" };
  if (row.userId !== userId) return { status: "foreign" };
  return { status: "ok", projectId: row.id };
}

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

/** GET /api/projects/me - Most recently updated project for the user. 204 when unauthenticated or none. */
projectsApp.get("/me", async (c) => {
  const user = c.get("user");
  if (!user) return c.body(null, 204);
  const project = await prisma.project.findFirst({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    include: { stacks: { orderBy: { sortOrder: "asc" } } },
  });
  if (!project) return c.body(null, 204);
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

/** POST /api/projects/new - Create a new project row with fresh state. Existing projects are unchanged. */
projectsApp.post("/new", requireUserMiddleware, zValidator("json", createNewProjectSchema), async (c) => {
  const user = requireUser(c);
  const body = c.req.valid("json");
  console.log("[projects] POST /new", { userId: user.id, name: body?.name });
  const name = body?.name ?? "Untitled";
  const formatSettings = body?.formatSettings ?? null;

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

/** POST /api/projects - Create a new project */
projectsApp.post("/", requireUserMiddleware, zValidator("json", createProjectSchema), async (c) => {
  const user = requireUser(c);
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
  requireUserMiddleware,
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
  requireUserMiddleware,
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
  requireUserMiddleware,
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

/** GET /api/projects/:id/packs - List local packs for a project. 204 when project not found (e.g. in-memory). */
projectsApp.get(
  "/:id/packs",
  requireUserMiddleware,
  zValidator("param", z.object({ id: z.string().trim().min(1) })),
  async (c) => {
    const user = requireUser(c);
    const { id } = c.req.param();

    const resolved = await resolveProjectIdForPackRoutes(id, user.id);
    if (resolved.status !== "ok") return c.body(null, 204);

    const packs = await prisma.projectPack.findMany({
      where: { projectId: resolved.projectId },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        name: true,
        coverImageS3Key: true,
        coverImageUrl: true,
        rootPath: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return c.json({
      packs: packs.map((pack) => ({
        ...pack,
        createdAt: pack.createdAt.getTime(),
        updatedAt: pack.updatedAt.getTime(),
      })),
    });
  },
);

/** POST /api/projects/:id/packs - Create a new local pack for a project */
projectsApp.post(
  "/:id/packs",
  requireUserMiddleware,
  zValidator("param", z.object({ id: z.string().trim().min(1) })),
  zValidator("json", createProjectPackSchema),
  async (c) => {
    const user = requireUser(c);
    const { id } = c.req.param();
    const { name } = c.req.valid("json");

    const resolved = await resolveProjectIdForPackRoutes(id, user.id);
    if (resolved.status === "foreign") {
      throw new HTTPException(403, { message: "Not authorized" });
    }

    let projectId: string;
    if (resolved.status === "ok") {
      projectId = resolved.projectId;
    } else {
      const stackId = crypto.randomUUID();
      await prisma.project.create({
        data: {
          id,
          userId: user.id,
          name: "Untitled",
          activeStackId: stackId,
          stacks: {
            create: {
              id: stackId,
              name: "Stack 1",
              sortOrder: 0,
              slots: [null, null, null, null] as Prisma.InputJsonValue,
              activeSlotIndex: 0,
              previewMode: "single",
              bpmAuto: true,
              globalTempoBpm: 120,
            },
          },
        },
      });
      projectId = id;
    }

    const packId = crypto.randomUUID();
    const pack = await prisma.projectPack.create({
      data: {
        id: packId,
        projectId,
        name: normalizeName(name),
        rootPath: null,
      },
      select: {
        id: true,
        name: true,
        coverImageS3Key: true,
        coverImageUrl: true,
        rootPath: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return c.json(
      {
        ...pack,
        createdAt: pack.createdAt.getTime(),
        updatedAt: pack.updatedAt.getTime(),
      },
      201,
    );
  },
);

const packIdParamSchema = z.object({ id: z.string().trim().min(1), packId: z.string().trim().min(1) });

/** PATCH /api/projects/:id/packs/:packId - Update local pack metadata (name, cover) */
projectsApp.patch(
  "/:id/packs/:packId",
  requireUserMiddleware,
  zValidator("param", packIdParamSchema),
  zValidator("json", updateProjectPackSchema),
  async (c) => {
    const user = requireUser(c);
    const { id, packId } = c.req.param();
    const body = c.req.valid("json");

    const resolved = await resolveProjectIdForPackRoutes(id, user.id);
    if (resolved.status !== "ok") {
      throw new HTTPException(404, { message: "Project not found" });
    }

    const pack = await prisma.projectPack.findUnique({
      where: { id: packId, projectId: resolved.projectId },
    });
    if (!pack) throw new HTTPException(404, { message: "Pack not found" });

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = normalizeName(body.name);
    if (body.coverImageS3Key !== undefined) data.coverImageS3Key = body.coverImageS3Key;
    if (body.coverImageUrl !== undefined) data.coverImageUrl = body.coverImageUrl;

    if (Object.keys(data).length === 0) {
      const unchanged = await prisma.projectPack.findUnique({
        where: { id: packId },
        select: {
          id: true,
          name: true,
          coverImageS3Key: true,
          coverImageUrl: true,
          rootPath: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      if (!unchanged) throw new HTTPException(404, { message: "Pack not found" });
      return c.json({
        ...unchanged,
        createdAt: unchanged.createdAt.getTime(),
        updatedAt: unchanged.updatedAt.getTime(),
      });
    }

    const updated = await prisma.projectPack.update({
      where: { id: packId },
      data: data as Parameters<typeof prisma.projectPack.update>[0]["data"],
      select: {
        id: true,
        name: true,
        coverImageS3Key: true,
        coverImageUrl: true,
        rootPath: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return c.json({
      ...updated,
      createdAt: updated.createdAt.getTime(),
      updatedAt: updated.updatedAt.getTime(),
    });
  },
);

/** POST /api/projects/:id/packs/:packId/cover-upload-url - Presigned URL for local pack cover */
projectsApp.post(
  "/:id/packs/:packId/cover-upload-url",
  requireUserMiddleware,
  zValidator("param", packIdParamSchema),
  zValidator("json", projectCoverUploadSchema),
  async (c) => {
    const user = requireUser(c);
    const { id, packId } = c.req.param();
    const { contentType } = c.req.valid("json");

    const resolved = await resolveProjectIdForPackRoutes(id, user.id);
    if (resolved.status !== "ok") {
      throw new HTTPException(404, { message: "Project not found" });
    }

    const pack = await prisma.projectPack.findUnique({
      where: { id: packId, projectId: resolved.projectId },
    });
    if (!pack) throw new HTTPException(404, { message: "Pack not found" });

    const key = `projects/${user.id}/${resolved.projectId}/packs/${packId}/cover-${Date.now()}.${contentType.includes("png") ? "png" : "jpg"}`;
    const uploadUrl = await getPresignedUploadUrl(key, contentType);

    return c.json({ key, uploadUrl, expiresIn: 3600 });
  },
);

/** GET /api/projects/:id/packs/:packId/cover - Serve local pack cover from S3 */
projectsApp.get(
  "/:id/packs/:packId/cover",
  requireUserMiddleware,
  zValidator("param", packIdParamSchema),
  async (c) => {
    const user = requireUser(c);
    const { id, packId } = c.req.param();

    const resolved = await resolveProjectIdForPackRoutes(id, user.id);
    if (resolved.status !== "ok") {
      throw new HTTPException(404, { message: "Project not found" });
    }

    const pack = await prisma.projectPack.findUnique({
      where: { id: packId, projectId: resolved.projectId },
      select: { coverImageS3Key: true },
    });
    if (!pack?.coverImageS3Key) {
      throw new HTTPException(404, { message: "Pack cover not found" });
    }

    const buf = await getFromS3(pack.coverImageS3Key);
    if (!buf) throw new HTTPException(404, { message: "Cover image not found" });

    const ext = pack.coverImageS3Key.split(".").pop()?.toLowerCase();
    const ct = ext === "png" ? "image/png" : "image/jpeg";
    return c.body(new Uint8Array(buf), 200, {
      "Content-Type": ct,
      "Cache-Control": "private, max-age=3600",
    });
  },
);

/** GET /api/projects/:id/packs/:packId/structure - Fetch pack folders and entries */
projectsApp.get(
  "/:id/packs/:packId/structure",
  requireUserMiddleware,
  zValidator("param", packIdParamSchema),
  async (c) => {
    const user = requireUser(c);
    const { id, packId } = c.req.param();

    const resolved = await resolveProjectIdForPackRoutes(id, user.id);
    if (resolved.status !== "ok") {
      throw new HTTPException(404, { message: "Project not found" });
    }

    const pack = await prisma.projectPack.findUnique({
      where: { id: packId, projectId: resolved.projectId },
      include: {
        folders: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
        entries: { orderBy: [{ sortOrder: "asc" }, { displayName: "asc" }] },
      },
    });
    if (!pack) throw new HTTPException(404, { message: "Pack not found" });

    const folders = pack.folders.map((f) => ({
      id: f.id,
      parentId: f.parentId,
      name: f.name,
      sortOrder: f.sortOrder,
    }));
    const entries = pack.entries.map((e) => ({
      id: e.id,
      folderId: e.folderId,
      displayName: e.displayName,
      sourceRef: e.sourceRef,
      regionStart: e.regionStart,
      regionEnd: e.regionEnd,
      sortOrder: e.sortOrder,
    }));

    return c.json({ folders, entries });
  },
);

/** PUT /api/projects/:id/packs/:packId/structure - Save pack folders and entries */
projectsApp.put(
  "/:id/packs/:packId/structure",
  requireUserMiddleware,
  zValidator("param", packIdParamSchema),
  zValidator("json", packStructureSchema),
  async (c) => {
    const user = requireUser(c);
    const { id, packId } = c.req.param();
    const { folders, entries } = c.req.valid("json");

    const resolved = await resolveProjectIdForPackRoutes(id, user.id);
    if (resolved.status !== "ok") {
      throw new HTTPException(404, { message: "Project not found" });
    }

    const pack = await prisma.projectPack.findUnique({
      where: { id: packId, projectId: resolved.projectId },
    });
    if (!pack) throw new HTTPException(404, { message: "Pack not found" });

    await prisma.$transaction(async (tx) => {
      await tx.projectPackEntry.deleteMany({ where: { packId } });
      await tx.projectPackFolder.deleteMany({ where: { packId } });

      if (folders.length > 0) {
        await tx.projectPackFolder.createMany({
          data: folders.map((f) => ({
            id: f.id,
            packId,
            parentId: f.parentId,
            name: f.name,
            sortOrder: f.sortOrder,
          })),
        });
      }

      if (entries.length > 0) {
        await tx.projectPackEntry.createMany({
          data: entries.map((e) => ({
            id: e.id,
            packId,
            folderId: e.folderId,
            displayName: e.displayName,
            sourceRef: e.sourceRef,
            regionStart: e.regionStart,
            regionEnd: e.regionEnd,
            sortOrder: e.sortOrder,
          })),
        });
      }
    });

    return c.json({ success: true });
  },
);

/** POST /api/projects/:id/packs/:packId/publish - Validate structure and create Pack in library. Client uploads samples separately. */
projectsApp.post(
  "/:id/packs/:packId/publish",
  requireUserMiddleware,
  zValidator("param", packIdParamSchema),
  zValidator("json", z.object({ packName: z.string().trim().min(1).max(120).optional() }).optional().default({})),
  async (c) => {
    const user = requireUser(c);
    const { id, packId } = c.req.param();
    const body = c.req.valid("json");

    const resolved = await resolveProjectIdForPackRoutes(id, user.id);
    if (resolved.status !== "ok") {
      throw new HTTPException(404, { message: "Project not found" });
    }

    const pack = await prisma.projectPack.findUnique({
      where: { id: packId, projectId: resolved.projectId },
      include: { entries: true },
    });
    if (!pack) throw new HTTPException(404, { message: "Pack not found" });

    const unnamed = pack.entries.filter((e) => !e.displayName?.trim());
    if (unnamed.length > 0) {
      throw new HTTPException(400, {
        message: `All entries must have a display name before publishing. ${unnamed.length} entry/entries missing name.`,
      });
    }

    const packName = body.packName ?? pack.name;
    const remotePack = await prisma.pack.create({
      data: {
        name: normalizeName(packName),
        ownerId: user.id,
        isPublic: true,
      },
      select: { id: true, name: true },
    });

    return c.json(
      {
        packId: remotePack.id,
        packName: remotePack.name,
        entryCount: pack.entries.length,
        message: "Pack created. Upload samples via library API.",
      },
      201,
    );
  },
);

/** DELETE /api/projects/:id/packs/:packId - Remove a local pack from a project */
projectsApp.delete(
  "/:id/packs/:packId",
  requireUserMiddleware,
  zValidator("param", z.object({ id: z.string().trim().min(1), packId: z.string().trim().min(1) })),
  async (c) => {
    const user = requireUser(c);
    const { id, packId } = c.req.param();

    const resolved = await resolveProjectIdForPackRoutes(id, user.id);
    if (resolved.status === "none") throw new HTTPException(404, { message: "Project not found" });
    if (resolved.status === "foreign") throw new HTTPException(403, { message: "Not authorized" });

    const pack = await prisma.projectPack.findUnique({
      where: { id: packId },
      select: { id: true, projectId: true },
    });
    if (!pack || pack.projectId !== resolved.projectId) {
      throw new HTTPException(404, { message: "Pack not found" });
    }

    await prisma.projectPack.delete({ where: { id: packId } });
    return c.body(null, 204);
  },
);

export { projectsApp };
