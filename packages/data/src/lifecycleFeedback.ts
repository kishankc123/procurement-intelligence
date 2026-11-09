// The feedback queue of a user's own lifecycle. A user's own project has no feedback yet, so the queue starts with a few labelled samples (two already
// decided, one pending) and the user adds their own. Kept in sessionStorage like the lifecycle itself; nothing is sent to the shared queue or a server.
import { create } from 'zustand'
import { z } from 'zod'

export const LifecycleFeedback = z.object({
  id: z.string(),
  about: z.string(),
  rating: z.enum(['helpful', 'not_helpful']),
  note: z.string(),
  status: z.enum(['pending', 'accepted', 'rejected']),
  /** True for the starting examples, false for what the user typed. */
  sample: z.boolean(),
})
export type LifecycleFeedback = z.infer<typeof LifecycleFeedback>

/** Starting examples: wording only, no figures. Two decided, one pending, so every state of the queue is visible. */
export const SAMPLE_FEEDBACK: LifecycleFeedback[] = [
  { id: 'SAMPLE-FB-1', about: 'Bid validity suggested in the tender clauses', rating: 'helpful', note: 'Covers our evaluation period.', status: 'accepted', sample: true },
  { id: 'SAMPLE-FB-2', about: 'Time from advertisement to signing in the plan', rating: 'not_helpful', note: 'Our approval steps are not in the reference projects.', status: 'rejected', sample: true },
  { id: 'SAMPLE-FB-3', about: 'Early-warning signal on disbursement', rating: 'helpful', note: '', status: 'pending', sample: true },
]

const KEY = 'pi.myLifecycleFeedback'

function load(): LifecycleFeedback[] {
  try {
    const raw = sessionStorage.getItem(KEY)
    const parsed = raw ? z.array(LifecycleFeedback).safeParse(JSON.parse(raw)) : null
    if (parsed?.success) return parsed.data
  } catch { /* storage blocked or unreadable: start from the samples */ }
  return SAMPLE_FEEDBACK
}

interface LifecycleFeedbackState {
  rows: LifecycleFeedback[]
  add: (about: string, rating: LifecycleFeedback['rating'], note: string) => void
  decide: (id: string, status: 'accepted' | 'rejected') => void
  reset: () => void
}

// Shared singleton: the shell and the learning remote import this same module instance.
export const useLifecycleFeedback = create<LifecycleFeedbackState>((set) => ({
  rows: load(),
  add: (about, rating, note) => set((s) => ({
    rows: [...s.rows, { id: `LFB-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, about: about.trim(), rating, note: note.trim(), status: 'pending', sample: false }],
  })),
  decide: (id, status) => set((s) => ({ rows: s.rows.map((r) => (r.id === id && r.status === 'pending' ? { ...r, status } : r)) })),
  reset: () => set({ rows: SAMPLE_FEEDBACK }),
}))
useLifecycleFeedback.subscribe((s) => {
  try { sessionStorage.setItem(KEY, JSON.stringify(s.rows)) } catch { /* storage blocked: the queue lives for this page only */ }
})

/** The same figures the Learning page shows, over this queue. Null when it is empty, so nothing is estimated. */
export function lifecycleFeedbackKpis(rows: LifecycleFeedback[]) {
  if (rows.length === 0) return null
  const accepted = rows.filter((r) => r.status === 'accepted').length
  const rejected = rows.filter((r) => r.status === 'rejected').length
  return { total: rows.length, reviewed: accepted + rejected, accepted, rejected }
}
