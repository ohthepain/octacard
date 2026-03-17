/**
 * Rooms API - public rooms list for collaboration.
 * In-memory registry of live rooms (free, temporary, not persisted).
 * Rooms are registered when user goes live and unregistered when they leave.
 */
import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import type { AppVariables } from "../types.js";
import { optionalAuth } from "../middleware/auth-guard.js";

export interface PublicRoomInfo {
  roomId: string;
  projectId: string;
  projectName: string;
  participantCount: number;
  /** Display URL for project cover image (optional) */
  coverImageUrl?: string | null;
  /** User ID of room creator (for Close Room vs Leave Room) */
  creatorId?: string | null;
}

const rooms = new Map<string, PublicRoomInfo>();

const registerSchema = z.object({
  roomId: z.string().min(1),
  projectId: z.string().min(1),
  projectName: z.string(),
  participantCount: z.number().int().min(0),
  coverImageUrl: z.string().nullable().optional(),
});

const unregisterSchema = z.object({
  roomId: z.string().min(1),
});

const roomsApp = new Hono<{ Variables: AppVariables }>();

roomsApp.get("/public", (c) => {
  const list = Array.from(rooms.values());
  return c.json({ rooms: list });
});

roomsApp.post("/register", optionalAuth, zValidator("json", registerSchema), (c) => {
  const body = c.req.valid("json");
  const user = c.get("user");
  rooms.set(body.roomId, {
    roomId: body.roomId,
    projectId: body.projectId,
    projectName: body.projectName,
    participantCount: body.participantCount,
    coverImageUrl: body.coverImageUrl ?? null,
    creatorId: user?.id ?? null,
  });
  return c.json({ ok: true });
});

roomsApp.post("/unregister", zValidator("json", unregisterSchema), (c) => {
  const { roomId } = c.req.valid("json");
  rooms.delete(roomId);
  return c.json({ ok: true });
});

export { roomsApp };
