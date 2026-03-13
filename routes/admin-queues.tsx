import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import AdminQueues from "@/pages/AdminQueues";

export const adminQueuesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/queues",
  component: AdminQueues,
});
