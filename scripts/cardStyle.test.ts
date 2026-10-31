// @vitest-environment node
// Guards two style decisions about cards: they are as tall as their text needs (no forced aspect ratio), and one setting rounds every card.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

describe('card style', () => {
  it('the landing cards size to their text: no aspect ratio, no fixed height', () => {
    const css = read('apps/shell/src/pages/Landing.module.css')
    const rules = css.split('\n').filter((l) => /^\.(layers li|steps li)\b(?!::)/.test(l))
    expect(rules.length).toBe(2)
    for (const rule of rules) { expect(rule).not.toMatch(/aspect-ratio|\bheight\s*:|min-height/) }
  })
  it('one setting rounds every card: the card radius is generous and the reusable Card (rounded-xl) follows it', () => {
    const radius = Number(/--radius-card:\s*(\d+)px/.exec(read('packages/ui/src/tokens.css'))?.[1])
    expect(radius).toBeGreaterThanOrEqual(16)
    expect(read('packages/ui/src/styles/globals.css')).toMatch(/--radius-xl:\s*var\(--radius-card\)/)
    expect(read('packages/ui/src/components/ui/card.tsx')).toMatch(/rounded-xl/)
  })
  it('the landing cards take their corners from the same setting', () => {
    const css = read('apps/shell/src/pages/Landing.module.css')
    for (const l of css.split('\n').filter((x) => /^\.(layers li|steps li)\b(?!::)/.test(x))) expect(l).toMatch(/border-radius:\s*var\(--radius-card\)/)
  })
})
