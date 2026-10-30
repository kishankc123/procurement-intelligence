// Vector helpers for embeddings: pack to int8, unpack, cosine ranking, 2D map. Pure and dependency-free (typed arrays only), so the server
// and the tests share them. A vector is stored as int8 with one float32 scale per vector: the largest component maps to 127.

export interface PackedVectors { bytes: Uint8Array; count: number; dimensions: number }

/** Layout: count float32 scales, then count*dimensions int8 values. Vectors are L2-normalised first, so the stored form is direction only. */
export function packVectors(vectors: number[][]): PackedVectors {
  const count = vectors.length
  const dimensions = vectors[0]?.length ?? 0
  const bytes = new Uint8Array(count * 4 + count * dimensions)
  const view = new DataView(bytes.buffer)
  vectors.forEach((raw, i) => {
    if (raw.length !== dimensions) throw new Error(`Vector ${i} has ${raw.length} values, expected ${dimensions}`)
    const norm = Math.sqrt(raw.reduce((s, x) => s + x * x, 0)) || 1
    const v = raw.map((x) => x / norm)
    const max = v.reduce((m, x) => Math.max(m, Math.abs(x)), 0) || 1
    view.setFloat32(i * 4, max, true)
    const base = count * 4 + i * dimensions
    for (let d = 0; d < dimensions; d++) view.setInt8(base + d, Math.round((v[d]! / max) * 127))
  })
  return { bytes, count, dimensions }
}

/** The vectors back as unit-length float arrays, ready for dot products. */
export function unpackVectors(bytes: Uint8Array, count: number, dimensions: number): Float32Array[] {
  if (bytes.length !== count * 4 + count * dimensions) throw new Error('Vector file does not match its manifest')
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  return Array.from({ length: count }, (_, i) => {
    const scale = view.getFloat32(i * 4, true) / 127
    const out = new Float32Array(dimensions)
    const base = count * 4 + i * dimensions
    let sum = 0
    for (let d = 0; d < dimensions; d++) { const x = view.getInt8(base + d) * scale; out[d] = x; sum += x * x }
    const norm = Math.sqrt(sum) || 1
    for (let d = 0; d < dimensions; d++) out[d]! /= norm
    return out
  })
}

export const dot = (a: ArrayLike<number>, b: ArrayLike<number>) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!; return s }

export function normalise(v: number[]): Float32Array {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1
  return Float32Array.from(v, (x) => x / norm)
}

/** The k vectors most similar to the query (cosine, since both sides are unit length), best first. Ties keep the lower index. */
export function topK(query: ArrayLike<number>, vectors: Float32Array[], k: number): { index: number; score: number }[] {
  return vectors.map((v, index) => ({ index, score: dot(query, v) })).sort((a, b) => b.score - a.score || a.index - b.index).slice(0, Math.max(0, k))
}

/**
 * Reciprocal rank fusion of ranked id lists: an id near the top of several lists beats one at the top of a single list.
 * `k` damps the weight of the very first ranks (60 is the usual value).
 */
export function fuseRanks(lists: string[][], k = 60): { id: string; score: number }[] {
  const score = new Map<string, number>()
  for (const list of lists) list.forEach((id, rank) => score.set(id, (score.get(id) ?? 0) + 1 / (k + rank + 1)))
  return [...score].map(([id, s]) => ({ id, score: s })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
}

/**
 * Projects unit vectors onto their two main directions (PCA by power iteration, no library) and scales to 0..1 for drawing.
 * Deterministic: the starting direction is fixed, and the sign of each axis is fixed so the same data draws the same map.
 */
export function pca2(vectors: Float32Array[], iterations = 40): [number, number][] {
  const n = vectors.length
  if (n === 0) return []
  const d = vectors[0]!.length
  const mean = new Float32Array(d)
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j]! += v[j]! / n
  const centred = vectors.map((v) => Float32Array.from(v, (x, j) => x - mean[j]!))
  const axis = (against: Float32Array | null): Float32Array => {
    let w = Float32Array.from({ length: d }, (_, j) => Math.sin(j + 1) + 1.5)
    for (let it = 0; it < iterations; it++) {
      const next = new Float32Array(d)
      for (const row of centred) { const p = dot(row, w); for (let j = 0; j < d; j++) next[j]! += row[j]! * p }
      if (against) { const p = dot(next, against); for (let j = 0; j < d; j++) next[j]! -= p * against[j]! }
      const norm = Math.sqrt(dot(next, next)) || 1
      w = next.map((x) => x / norm)
    }
    const big = w.reduce((m, x, j) => (Math.abs(x) > Math.abs(w[m]!) ? j : m), 0)
    return w[big]! < 0 ? w.map((x) => -x) : w
  }
  const a = axis(null)
  const b = axis(a)
  const raw = centred.map((row) => [dot(row, a), dot(row, b)] as [number, number])
  const range = (i: 0 | 1) => { const xs = raw.map((r) => r[i]); const lo = Math.min(...xs), hi = Math.max(...xs); return { lo, span: hi - lo || 1 } }
  const rx = range(0), ry = range(1)
  return raw.map(([x, y]) => [(x - rx.lo) / rx.span, (y - ry.lo) / ry.span])
}

/** Which chunk texts need a new embedding: the hash of the text changed or there is none yet. */
export function changedChunks(chunks: { chunk_id: string; text: string }[], known: Map<string, string>, hash: (text: string) => string) {
  return chunks.filter((c) => known.get(c.chunk_id) !== hash(c.text))
}
