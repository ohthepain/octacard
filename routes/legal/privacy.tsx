import { createRoute } from '@tanstack/react-router'
import { rootRoute } from '../__root'
import PrivacyPolicy from '@/pages/PrivacyPolicy'

export const privacyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/legal/privacy',
  component: PrivacyPolicy,
})
