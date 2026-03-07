import { createRoute } from '@tanstack/react-router'
import { rootRoute } from './__root'
import SignIn from '@/pages/SignIn'

export const signInRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/sign-in',
  component: SignIn,
})
