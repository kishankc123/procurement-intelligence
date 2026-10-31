import { useSyncExternalStore } from 'react'

/**
 * Which project is being ingested right now, shared by every ingest card in the chat (each card follows its own run, so alone they cannot know about
 * another card's). One ingestion at a time: while this is set, every other Proceed button is off.
 */
export interface BusyIngest { owner: string; projectId: string; name: string }
let current: BusyIngest | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function markIngesting(owner: string, projectId: string, name: string): void {
  if (current && current.owner === owner && current.projectId === projectId) return
  current = { owner, projectId, name }; emit()
}
/** Frees the slot, but only for the card that took it (a card must not clear another card's run). */
export function markIdle(owner: string): void {
  if (current?.owner !== owner) return
  current = null; emit()
}
export const currentIngest = (): BusyIngest | null => current
export function resetIngestBusy(): void { current = null; emit() }

export function useBusyIngest(): BusyIngest | null {
  return useSyncExternalStore((l) => { listeners.add(l); return () => { listeners.delete(l) } }, () => current, () => null)
}
