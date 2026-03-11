import { Hono } from "hono";
import { serveStatic } from "@hono/node-server/serve-static";
import { createBullBoard } from "@bull-board/api";
import { HonoAdapter } from "@bull-board/hono";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { sampleAnalysisQueue } from "../queues/sample-analysis.js";
import type { AppVariables } from "../types.js";

const adminApp = new Hono<{ Variables: AppVariables }>();

const serverAdapter = new HonoAdapter(serveStatic);
serverAdapter.setBasePath("/api/admin/queues");

createBullBoard({
  queues: [new BullMQAdapter(sampleAnalysisQueue)],
  serverAdapter,
  options: {
    uiConfig: {
      boardTitle: "OctaCard Queues",
    },
  },
});

adminApp.route("/queues", serverAdapter.registerPlugin());

export { adminApp };
