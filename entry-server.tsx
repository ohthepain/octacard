import { renderToStream } from '@tanstack/start/server'
import { createRouter } from './router'
import { getRouterManifest } from '@tanstack/start/router-manifest'

export default async function handler(request: Request) {
  const router = createRouter()
  const manifest = await getRouterManifest()

  return renderToStream({
    request,
    router,
    manifest,
    getLoadContext: () => ({}),
  })
}
