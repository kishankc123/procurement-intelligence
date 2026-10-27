import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@pi/ui'
import Monitoring from './Monitoring'

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}><Monitoring /></QueryClientProvider>,
)
