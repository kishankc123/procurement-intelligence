import { create } from 'zustand'
import { DEFAULT_FISCAL_YEAR, DEFAULT_PROJECT_ID, type Role } from '@pi/config'
import { emit } from '@pi/events'
import type { AssistantReply } from './assistant'

/** One line of the landing-page chat. Plain data, so the conversation survives moving between pages. */
export interface ChatEntry {
  id: string
  role: 'user' | 'assistant' | 'error'
  text: string
  reply?: AssistantReply
  /** True until the reply has been played once (steps, then text, then the ready card). */
  animate?: boolean
}

interface UiState {
  chat: ChatEntry[]
  chatPending: boolean
  projectId: string
  /** The project the conversation is about: null until one is shown or named, and null again when the user turns to their own procurement. Separate from the filter's project, which always has a value. */
  chatProjectId: string | null
  fiscalYear: number
  role: Role
  setProject: (projectId: string) => void
  setChatProject: (projectId: string | null) => void
  addChat: (entry: ChatEntry) => void
  setChatPending: (pending: boolean) => void
  finishChat: (id: string) => void
  setFiscalYear: (fiscalYear: number) => void
  setRole: (role: Role) => void
}

const ROLE_KEY = 'pi.role'
function readRole(): Role {
  try {
    const v = localStorage.getItem(ROLE_KEY)
    if (v === 'planner' || v === 'contract_manager' || v === 'reviewer' || v === 'admin') return v
  } catch { /* storage blocked */ }
  return 'planner'
}

// Shared singleton: the shell and every remote import this same module instance.
export const useUiStore = create<UiState>((set) => ({
  chat: [],
  chatPending: false,
  addChat: (entry) => set((s) => ({ chat: [...s.chat, entry] })),
  setChatPending: (chatPending) => set({ chatPending }),
  finishChat: (id) => set((s) => ({ chat: s.chat.map((e) => (e.id === id ? { ...e, animate: false } : e)) })),
  projectId: DEFAULT_PROJECT_ID,
  chatProjectId: null,
  setChatProject: (chatProjectId) => set({ chatProjectId }),
  fiscalYear: DEFAULT_FISCAL_YEAR,
  role: readRole(),
  setProject: (projectId) => { set({ projectId }); emit('project:selected', { projectId }) },
  setFiscalYear: (fiscalYear) => { set({ fiscalYear }); emit('fiscalYear:changed', { fiscalYear }) },
  setRole: (role) => {
    try { localStorage.setItem(ROLE_KEY, role) } catch { /* ignore */ }
    set({ role }); emit('role:changed', { role })
  },
}))

/** The auth seam: swap this hook's body for real auth later; components never change. */
export function useCurrentUser(): { role: Role } {
  return { role: useUiStore((s) => s.role) }
}
