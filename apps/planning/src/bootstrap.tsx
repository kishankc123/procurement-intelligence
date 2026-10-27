import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@pi/ui'
import Planning from './Planning'

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}><Planning /></QueryClientProvider>,
)
