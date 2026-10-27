import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

const singleton = (name: string) => [name, { singleton: true, requiredVersion: false as const }] as const
// Shared singletons: one React, one router, one QueryClient context, one Zustand store, one event bus.
const shared = Object.fromEntries(
  ['react', 'react-dom', 'react-router', '@tanstack/react-query', 'zustand', '@pi/data', '@pi/events', '@pi/config', '@pi/ui', '@pi/domain'].map(singleton),
)

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'shell',
      remotes: {
        monitoring: { type: 'module', name: 'monitoring', entry: 'http://localhost:5175/remoteEntry.js' },
        planning: { type: 'module', name: 'planning', entry: 'http://localhost:5174/remoteEntry.js' },
      },
      shared,
    }),
  ],
  build: { target: 'esnext' },
})
