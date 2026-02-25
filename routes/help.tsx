import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import Help from '@/pages/Help'

export const helpRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/help',
  component: Help,
})
