import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@pi/data', async (orig) => ({
  ...(await orig<typeof import('@pi/data')>()),
  useCurrentUser: () => ({ role: 'planner' }),
  useProject: () => ({ data: [{ project_id: 'P1', project_name: 'Bihar Rural Roads Project' }] }),
  useTenderDraft: () => ({ isSuccess: true, data: [] }),
}))
vi.mock('./OnRecordCards', () => ({ TenderNoticesOnRecord: () => <p>3 tenders published</p> }))

import { TenderDraftCard } from './TenderDraftCard'

describe('TenderDraftCard for a real project with no draft', () => {
  it('shows the tenders and the own-procurement button, and no "no draft" card', () => {
    const onSend = vi.fn()
    render(<TenderDraftCard projectId="P1" onSend={onSend} />)
    expect(screen.queryByText(/Tender draft on record/)).toBeNull()
    expect(screen.queryByText(/No tender draft on record/)).toBeNull()
    expect(screen.getByText('3 tenders published')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Suggest a draft for my own procurement' }))
    expect(onSend).toHaveBeenCalledWith('Suggest tender clauses for my own procurement')
  })
})
