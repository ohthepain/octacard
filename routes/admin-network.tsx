import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import AdminNetwork from "@/pages/AdminNetwork";

export const adminNetworkRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/network",
  component: AdminNetwork,
});
