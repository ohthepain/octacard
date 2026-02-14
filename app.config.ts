import { defineConfig } from '@tanstack/start/config'
import { TanStackRouterVite } from '@tanstack/router-vite-plugin'
import viteReact from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  vite: {
    plugins: [
      TanStackRouterVite(),
      viteReact(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
    },
  },
})
