import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'

// Import routes
import { rootRoute } from './routes/__root'
import { indexRoute } from './routes/index'
import { helpRoute } from './routes/help'
import { signInRoute } from './routes/sign-in'
import { resetPasswordRoute } from './routes/reset-password'
import { legalRoute } from './routes/legal'
import { termsRoute } from './routes/legal/terms'
import { privacyRoute } from './routes/legal/privacy'
import { adminRoute } from './routes/admin'
import { adminNetworkRoute } from './routes/admin-network'
import { adminTaxonomyRoute } from './routes/admin-taxonomy'
import { adminQueuesRoute } from './routes/admin-queues'

const routeTree = rootRoute.addChildren([
  indexRoute,
  helpRoute,
  signInRoute,
  resetPasswordRoute,
  legalRoute,
  termsRoute,
  privacyRoute,
  adminRoute,
  adminNetworkRoute,
  adminTaxonomyRoute,
  adminQueuesRoute,
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
