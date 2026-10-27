import type { Role } from '@pi/config'

export interface EventMap {
  'project:selected': { projectId: string }
  'fiscalYear:changed': { fiscalYear: number }
  'role:changed': { role: Role }
  'enrichment:saved': { contractRef: string; field: string }
  'alert:assigned': { alertId: string; assignee: string }
  'feedback:submitted': { feedbackId: string; targetId: string }
}

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void

// Lives on window so every federated remote talks to the same bus.
const w = window as unknown as { __piBus?: EventTarget }
const bus = (w.__piBus ??= new EventTarget())

export function emit<K extends keyof EventMap>(type: K, payload: EventMap[K]): void {
  bus.dispatchEvent(new CustomEvent(type, { detail: payload }))
}

export function on<K extends keyof EventMap>(type: K, handler: Handler<K>): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<EventMap[K]>).detail)
  bus.addEventListener(type, listener)
  return () => bus.removeEventListener(type, listener)
}
