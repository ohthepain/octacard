import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./__root";
import AdminTaxonomy from "@/pages/AdminTaxonomy";

export const adminTaxonomyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/taxonomy",
  component: AdminTaxonomy,
});
