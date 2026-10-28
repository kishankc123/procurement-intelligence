import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@pi/ui'
// Standalone run only: inside the shell, the shell loads this stylesheet once.
import '@pi/ui/styles.css'
import Monitoring from './Monitoring'

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}><Monitoring /></QueryClientProvider>,
)
