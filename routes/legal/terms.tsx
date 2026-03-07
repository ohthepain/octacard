import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../__root'
import TermsOfService from '@/pages/TermsOfService'

export const termsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/legal/terms',
  component: TermsOfService,
})
