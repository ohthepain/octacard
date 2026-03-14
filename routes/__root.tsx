import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import { Toaster } from '@/components/ui/toaster'
import { Toaster as Sonner } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HotkeysProvider } from '@tanstack/react-hotkeys'
import { GlobalHotkeys } from '@/components/GlobalHotkeys'

const queryClient = new QueryClient()

export const rootRoute = createRootRouteWithContext<{
  queryClient: InstanceType<typeof QueryClient>
}>()({
  component: () => (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <QueryClientProvider client={queryClient}>
        <HotkeysProvider>
          <GlobalHotkeys />
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <Outlet />
          </TooltipProvider>
        </HotkeysProvider>
      </QueryClientProvider>
    </ThemeProvider>
  ),
})
