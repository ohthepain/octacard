import { RouterProvider } from '@tanstack/react-router'
import { createRouter } from './router'
import './src/index.css'

const router = createRouter()

function InnerRoot() {
  return <RouterProvider router={router} />
}

export default InnerRoot
