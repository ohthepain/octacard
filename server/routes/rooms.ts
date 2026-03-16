/**
 * Rooms API - public rooms list for collaboration.
 * Liveblocks does not provide a built-in "list public rooms" - this is a stub.
 * Can be extended to query Liveblocks REST API or maintain a rooms table.
 */
import { Hono } from "hono";
import type { AppVariables } from "../types.js";

const roomsApp = new Hono<{ Variables: AppVariables }>();

roomsApp.get("/public", (c) => {
  return c.json({ rooms: [] });
});

export { roomsApp };
