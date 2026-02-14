import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import Index from '@/pages/Index'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: Index,
})
