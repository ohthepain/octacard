import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'

// Import routes
import { rootRoute } from './routes/__root'
import { indexRoute } from './routes/index'
import { helpRoute } from './routes/help'
import { signInRoute } from './routes/sign-in'
import { legalRoute } from './routes/legal'
import { termsRoute } from './routes/legal/terms'
import { privacyRoute } from './routes/legal/privacy'

const routeTree = rootRoute.addChildren([
  indexRoute,
  helpRoute,
  signInRoute,
  legalRoute,
  termsRoute,
  privacyRoute,
])

export function createRouter() {
  const queryClient = new QueryClient()

  const router = createTanStackRouter({
    routeTree,
    context: {
      queryClient,
    },
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
