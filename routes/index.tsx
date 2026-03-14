import { createRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { rootRoute } from './__root'
import Index from '@/pages/Index'

const indexSearchSchema = z.object({
  openPack: z.string().optional(),
})

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => indexSearchSchema.parse(search),
  component: Index,
})
