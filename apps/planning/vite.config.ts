import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

const singleton = (name: string) => [name, { singleton: true, requiredVersion: false as const }] as const
const shared = Object.fromEntries(
  ['react', 'react-dom', 'react-router', '@tanstack/react-query', 'zustand', '@pi/data', '@pi/events', '@pi/config', '@pi/ui', '@pi/domain'].map(singleton),
)

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'planning',
      filename: 'remoteEntry.js',
      exposes: { './Planning': './src/Planning.tsx' },
      shared,
    }),
  ],
  server: { origin: 'http://localhost:5174' },
  build: { target: 'esnext' },
})
