import { create } from 'zustand'
import { DEFAULT_FISCAL_YEAR, DEFAULT_PROJECT_ID, type Role } from '@pi/config'
import { emit } from '@pi/events'

interface UiState {
  projectId: string
  fiscalYear: number
  role: Role
  setProject: (projectId: string) => void
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
  projectId: DEFAULT_PROJECT_ID,
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
