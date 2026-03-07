import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import Legal from '@/pages/Legal'

export const legalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/legal',
  component: Legal,
})
