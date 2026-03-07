import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { getPresignedUploadUrl } from "../s3.js";
import type { AppVariables } from "../types.js";

const uploadSchema = z.object({
  key: z.string().min(1).optional(),
  contentType: z.string().default("application/octet-stream"),
});

const uploadApp = new Hono<{ Variables: AppVariables }>();

uploadApp.get(
  "/url",
  zValidator("query", uploadSchema),
  async (c) => {
    const user = c.get("user");
    const { key, contentType } = c.req.valid("query");
    const prefix = `uploads/${user.id}/`;
    const fullKey = key?.startsWith(prefix) ? key : prefix + (key ?? `${Date.now()}`);
    const url = await getPresignedUploadUrl(fullKey, contentType);
    return c.json({ url, key: fullKey });
  }
);

export { uploadApp };
