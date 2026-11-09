import { describe, expect, it } from 'vitest'
import { changedChunks, dot, fuseRanks, normalise, packVectors, pca2, topK, unpackVectors } from './vectors'

const rand = (seed: number) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 - 0.5 }

describe('packVectors', () => {
  it('round-trips unit vectors with small error and 1 byte per value plus a scale per vector', () => {
    const r = rand(1)
    const vs = Array.from({ length: 5 }, () => Array.from({ length: 64 }, r))
    const packed = packVectors(vs)
    expect(packed.bytes.length).toBe(5 * 4 + 5 * 64)
    const back = unpackVectors(packed.bytes, 5, 64)
    vs.forEach((v, i) => expect(dot(normalise(v), back[i]!)).toBeGreaterThan(0.999))
    back.forEach((b) => expect(Math.sqrt(dot(b, b))).toBeCloseTo(1, 5))
  })
  it('rejects ragged vectors and files that do not match their manifest', () => {
    expect(() => packVectors([[1, 2], [1]])).toThrow('expected 2')
    expect(() => unpackVectors(new Uint8Array(3), 1, 4)).toThrow('does not match')
  })
  it('copes with an all-zero vector', () => {
    const [z] = unpackVectors(packVectors([[0, 0, 0]]).bytes, 1, 3)
    expect([...z!]).toEqual([0, 0, 0])
  })
})

describe('topK', () => {
  const vs = [[1, 0], [0, 1], [0.8, 0.6], [-1, 0]].map((v) => normalise(v))
  it('ranks by cosine, best first, and keeps the lower index on a tie', () => {
    expect(topK(normalise([1, 0]), vs, 3).map((x) => x.index)).toEqual([0, 2, 1])
    expect(topK(normalise([1, 0]), [vs[0]!, vs[0]!], 2).map((x) => x.index)).toEqual([0, 1])
    expect(topK(normalise([1, 0]), vs, 0)).toEqual([])
  })
})

describe('fuseRanks', () => {
  it('puts an id that two lists agree on above one that tops a single list', () => {
    const out = fuseRanks([['a', 'b', 'c'], ['b', 'd']])
    expect(out[0]!.id).toBe('b')
    expect(out.map((o) => o.id)).toEqual(['b', 'a', 'd', 'c'])
  })
  it('handles empty lists', () => { expect(fuseRanks([[], []])).toEqual([]) })
})

describe('pca2', () => {
  it('separates two clusters along the first axis, scaled to 0..1 and deterministic', () => {
    const r = rand(7)
    const a = Array.from({ length: 20 }, () => normalise([1 + r() * 0.1, r() * 0.1, r() * 0.1, 0.05]))
    const b = Array.from({ length: 20 }, () => normalise([r() * 0.1, 1 + r() * 0.1, r() * 0.1, 0.05]))
    const pts = pca2([...a, ...b])
    expect(pts).toEqual(pca2([...a, ...b]))
    for (const [x, y] of pts) { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1); expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1) }
    const meanX = (s: [number, number][]) => s.reduce((n, p) => n + p[0], 0) / s.length
    expect(Math.abs(meanX(pts.slice(0, 20)) - meanX(pts.slice(20)))).toBeGreaterThan(0.5)
  })
  it('returns nothing for no vectors and a point for one', () => {
    expect(pca2([])).toEqual([])
    expect(pca2([normalise([1, 2, 3])])).toEqual([[0, 0]])
  })
})

describe('changedChunks', () => {
  it('lists chunks with no stored hash or a different one', () => {
    const h = (t: string) => `h:${t}`
    const known = new Map([['a', 'h:one'], ['b', 'h:old']])
    expect(changedChunks([{ chunk_id: 'a', text: 'one' }, { chunk_id: 'b', text: 'two' }, { chunk_id: 'c', text: 'three' }], known, h).map((c) => c.chunk_id)).toEqual(['b', 'c'])
  })
})
