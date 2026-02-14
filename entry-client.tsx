import { hydrateRoot } from 'react-dom/client'
import { RouterProvider } from '@tanstack/react-router'
import { createRouter } from './router'

const router = createRouter()

hydrateRoot(document.getElementById('root')!, <RouterProvider router={router} />)
