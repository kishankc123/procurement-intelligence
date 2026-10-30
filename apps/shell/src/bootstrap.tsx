import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@pi/ui'
import '@pi/ui/styles.css'
import '@copilotkit/react-core/v2/styles.css'
import { App } from './App'
import { applyTheme, readTheme } from './theme'

applyTheme(readTheme())

// The shell owns the single QueryClient; remotes reuse it through the shared react-query singleton.
const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 5_000, retry: 1 } } })

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <BrowserRouter><App /></BrowserRouter>
  </QueryClientProvider>,
)
