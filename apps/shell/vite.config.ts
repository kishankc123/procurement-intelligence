import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { federation } from '@module-federation/vite'

const singleton = (name: string) => [name, { singleton: true, requiredVersion: false as const }] as const
// Shared singletons: one React, one router, one QueryClient context, one Zustand store, one event bus.
const shared = Object.fromEntries(
  ['react', 'react-dom', 'react-router', '@tanstack/react-query', 'zustand', '@pi/data', '@pi/events', '@pi/config', '@pi/ui', '@pi/domain'].map(singleton),
)

// Local dev and preview use one port per remote; on Vercel they live under /remotes/<name>/.
const remoteEntry = (name: string, port: number) =>
  process.env.DEPLOY === 'vercel' ? `/remotes/${name}/remoteEntry.js` : `http://localhost:${port}/remoteEntry.js`

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'shell',
      remotes: {
        learning: { type: 'module', name: 'learning', entry: remoteEntry('learning', 5176) },
        monitoring: { type: 'module', name: 'monitoring', entry: remoteEntry('monitoring', 5175) },
        planning: { type: 'module', name: 'planning', entry: remoteEntry('planning', 5174) },
      },
      shared,
    }),
  ],
  build: { target: 'esnext' },
})
