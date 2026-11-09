// "My lifecycle": the user's own procurement lifecycle, built by adding suggestions (a plan, tender clauses, estimates, monitoring and learning features).
// There is no login, so there is one lifecycle per browser session (sessionStorage): it survives moving between pages and reloads of the tab, and is gone
// when the tab closes. Nothing here is sent to a server. Everything added is a suggestion (derived) and keeps the basis it came with.
import { create } from 'zustand'
import { z } from 'zod'
import { STAGES, type LifecycleStage } from './assistant'

export const LifecycleItem = z.object({
  id: z.string(),
  /** Same key means same thing: adding it again replaces the earlier one. */
  key: z.string(),
  stage: z.enum(STAGES),
  kind: z.enum(['plan', 'tender-clauses', 'estimates', 'monitoring-feature', 'learning-feature']),
  title: z.string(),
  summary: z.string(),
  /** What the suggestion rests on (sample size, which projects, real or mock). Kept so the basis is never lost. */
  basis: z.string(),
  /** Derived while it is the application's suggestion; entered once the user has changed it. */
  provenance: z.enum(['derived', 'entered']),
  detail: z.unknown(),
  addedAt: z.string(),
  /** The user changed the suggestion. */
  edited: z.boolean().default(false),
  /** The user saved it as their final version. A final item is not edited until it is reopened. */
  final: z.boolean().default(false),
})
export type LifecycleItem = z.infer<typeof LifecycleItem>
export type NewLifecycleItem = Omit<LifecycleItem, 'id' | 'addedAt' | 'provenance' | 'edited' | 'final'>

/** What the user changed in an item: its figures (`detail`) and the one-line `summary` worked out from them. */
export interface LifecycleEdit { detail: unknown; summary: string }

const Saved = z.object({ name: z.string(), items: z.array(LifecycleItem) })
const KEY = 'pi.myLifecycle'
const empty = () => ({ name: 'My procurement lifecycle', items: [] as LifecycleItem[] })

function load() {
  try {
    const raw = sessionStorage.getItem(KEY)
    const parsed = raw ? Saved.safeParse(JSON.parse(raw)) : null
    if (parsed?.success) return parsed.data
  } catch { /* storage blocked or unreadable: start empty */ }
  return empty()
}

interface MyLifecycleState {
  name: string
  items: LifecycleItem[]
  add: (item: NewLifecycleItem) => void
  remove: (id: string) => void
  /** Replace an item's figures with the user's. Ignored for a final item: reopen it first. */
  update: (id: string, edit: LifecycleEdit) => void
  /** Save an item as final (true) or reopen it for editing (false). */
  setFinal: (id: string, final: boolean) => void
  rename: (name: string) => void
  clear: () => void
}

// Shared singleton: the shell and every remote import this same module instance.
export const useMyLifecycle = create<MyLifecycleState>((set) => ({
  ...load(),
  add: (item) => set((s) => ({
    items: [...s.items.filter((i) => i.key !== item.key), { ...item, id: `LC-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, provenance: 'derived', addedAt: new Date().toISOString(), edited: false, final: false }],
  })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  update: (id, edit) => set((s) => ({ items: s.items.map((i) => (i.id === id && !i.final ? { ...i, ...edit, edited: true, provenance: 'entered' as const } : i)) })),
  setFinal: (id, final) => set((s) => ({ items: s.items.map((i) => (i.id === id ? { ...i, final } : i)) })),
  rename: (name) => set({ name: name.trim() || empty().name }),
  clear: () => set(empty()),
}))
useMyLifecycle.subscribe((s) => {
  try { sessionStorage.setItem(KEY, JSON.stringify({ name: s.name, items: s.items })) } catch { /* storage blocked: the lifecycle lives for this page only */ }
})

/** Items per stage, and the stages that still have nothing in them. */
export function lifecycleStatus(items: LifecycleItem[]) {
  const byStage = Object.fromEntries(STAGES.map((st) => [st, items.filter((i) => i.stage === st)])) as Record<LifecycleStage, LifecycleItem[]>
  return { byStage, missing: STAGES.filter((st) => byStage[st].length === 0), complete: STAGES.every((st) => byStage[st].length > 0) }
}

/** The dated milestones of a planning-estimates item, so the model can work out "a month later" from the real dates. */
function datesOf(i: LifecycleItem): { dates?: { milestone: string; date: string }[] } {
  const t = (i.detail as { timeline?: { milestones?: unknown } } | null)?.timeline
  if (i.kind !== 'estimates' || !t || !Array.isArray(t.milestones)) return {}
  const dates = (t.milestones as { label?: unknown; date?: unknown }[]).filter((m) => typeof m.label === 'string' && typeof m.date === 'string').map((m) => ({ milestone: m.label as string, date: m.date as string }))
  return dates.length > 0 ? { dates } : {}
}

/** What the model is told about the user's lifecycle, so it can say what is in it and what is still missing. Short on purpose. */
export function describeLifecycle(name: string, items: LifecycleItem[]) {
  const { missing, complete } = lifecycleStatus(items)
  return { name, complete, stagesStillEmpty: missing, items: items.map((i) => ({ stage: i.stage, kind: i.kind, title: i.title, summary: i.summary, status: i.final ? 'final' : i.edited ? 'edited by the user' : 'suggested', ...datesOf(i) })) }
}
