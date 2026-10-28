import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { federation } from '@module-federation/vite'

const singleton = (name: string) => [name, { singleton: true, requiredVersion: false as const }] as const
const shared = Object.fromEntries(
  ['react', 'react-dom', 'react-router', '@tanstack/react-query', 'zustand', '@pi/data', '@pi/events', '@pi/config', '@pi/ui', '@pi/domain'].map(singleton),
)

// On Vercel every remote is served from /remotes/<name>/ on the same origin.
const base = process.env.DEPLOY === 'vercel' ? '/remotes/monitoring/' : '/'

export default defineConfig({
  base,
  plugins: [
    react(),
    tailwindcss(),
    federation({
      name: 'monitoring',
      filename: 'remoteEntry.js',
      exposes: { './Monitoring': './src/Monitoring.tsx' },
      shared,
    }),
  ],
  server: { origin: 'http://localhost:5175' },
  build: { target: 'esnext' },
})
