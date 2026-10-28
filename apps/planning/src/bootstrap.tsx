import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import '@pi/ui'
// Standalone run only: inside the shell, the shell loads this stylesheet once.
import '@pi/ui/styles.css'
import Planning from './Planning'

// Same address layout as in the shell: Planning lives under /planning.
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <BrowserRouter>
      <Routes>
        <Route path="/planning/*" element={<Planning />} />
        <Route path="*" element={<Navigate to="/planning" replace />} />
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>,
)
