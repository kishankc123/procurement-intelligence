import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { environment: 'jsdom', include: ['packages/**/*.test.ts', 'packages/**/*.test.tsx', 'scripts/**/*.test.ts', 'apps/**/*.test.tsx', 'ingest/**/*.test.ts'] } })
