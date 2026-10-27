import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@pi/ui'
import Learning from './Learning'

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}><Learning /></QueryClientProvider>,
)
