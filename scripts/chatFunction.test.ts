// @vitest-environment node
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { answer, type AssistantDb } from '../packages/data/src/assistant'
import { bundleCopilot, copilotTarget, target, transpile } from './build-chat-function.mjs'

describe('the Vercel chat function copy (api/_lib/assistant.js)', () => {
  it('is up to date with assistant.ts (run `pnpm build:chat` if this fails)', () => {
    expect(readFileSync(target as string, 'utf8')).toBe((transpile as () => string)())
  })

  it('gives the same answers as the source for the seed data', () => {
    const generated = createRequire(import.meta.url)(target as string) as { answer: typeof answer }
    const db = JSON.parse(readFileSync(new URL('../mock/db.json', import.meta.url), 'utf8')) as AssistantDb
    for (const message of ['help me with one of the mock projects', 'show the plan timeline', 'show me monitoring', 'show learning', 'a tender draft please', 'show me the entire timeline', 'hello']) {
      expect(generated.answer(db, message, 'P-MOCK-001')).toEqual(answer(db, message, 'P-MOCK-001'))
    }
  })

  it('has an up to date CopilotKit runtime bundle (api/_lib/copilot.js)', () => {
    expect(readFileSync(copilotTarget as string, 'utf8')).toBe((bundleCopilot as () => string)())
  })
})
