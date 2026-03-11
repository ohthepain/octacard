import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import Admin from "@/pages/Admin";

export const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin",
  component: Admin,
});
