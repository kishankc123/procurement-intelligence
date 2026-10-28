import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { get, send } from './api'
import * as S from './schemas'
import { emit } from '@pi/events'
import { useCurrentUser } from './store'

function list<T extends z.ZodTypeAny>(key: string, path: string, schema: T) {
  return { queryKey: [key, path], queryFn: async () => z.array(schema).parse(await get<unknown>(path)) as z.infer<T>[] }
}
const q = encodeURIComponent

export const useMeta = () => useQuery({ queryKey: ['meta'], queryFn: async () => S.Meta.parse(await get<unknown>('/meta')) })
export const useProjects = () => useQuery(list('projects', '/projects', S.Project))
export const useProject = (id: string) => useQuery(list('projects', `/projects?project_id=${q(id)}`, S.Project))
export const useContracts = (projectId: string, fy?: number) =>
  useQuery(list('contracts', `/contracts?project_id=${q(projectId)}${fy ? `&fiscal_year=${fy}` : ''}`, S.Contract))
export const useAllContracts = () => useQuery(list('contracts', '/contracts', S.Contract))
export const useContractMilestones = () => useQuery(list('contract_milestones', '/contract_milestones', S.ContractMilestone))
export const useEnrichments = () => useQuery(list('enrichments', '/enrichments', S.Enrichment))
export const useAmendments = () => useQuery(list('amendments', '/amendments', S.Amendment))
export const usePlan = (projectId: string) => useQuery(list('plans', `/plans?project_id=${q(projectId)}`, S.Plan))
export const useAllPlans = () => useQuery(list('plans', '/plans', S.Plan))
export const useTenderDraft = (projectId: string) => useQuery(list('tender_drafts', `/tender_drafts?project_id=${q(projectId)}`, S.TenderDraft))
export const useReports = (projectId: string) => useQuery(list('supervision_reports', `/supervision_reports?project_id=${q(projectId)}`, S.SupervisionReport))
export const useCompletionReports = () => useQuery(list('completion_reports', '/completion_reports', S.CompletionReport))
export const useCountryYears = (country: string) => useQuery(list('country_years', `/country_years?country=${q(country)}`, S.CountryYear))
export const useGovernance = (country: string) => useQuery(list('governance', `/governance?country=${q(country)}`, S.Governance))
export const useRecommendations = (projectId: string) => useQuery(list('recommendations', `/recommendations?project_id=${q(projectId)}`, S.Recommendation))
export const useChunks = () => useQuery(list('chunks', '/chunks', S.Chunk))
export const useDocs = () => useQuery(list('documents', '/documents', S.Doc))
export const useAlertStates = () => useQuery(list('alerts', '/alerts', S.AlertState))
export const useFeedback = () => useQuery(list('feedback', '/feedback', S.Feedback))
export const useSources = () => useQuery(list('sources', '/sources', S.Source))
export const useSourceLinks = (projectId: string) => useQuery(list('source_links', `/source_links?project_id=${q(projectId)}`, S.SourceLink))
export const useIngestionRuns = (projectId: string) => useQuery(list('ingestion_runs', `/ingestion_runs?project_id=${q(projectId)}`, S.IngestionRun))
export const useScheduleItems = () => useQuery(list('schedule_items', '/schedule_items', S.ScheduleItem))
export const useTenderHistory = () => useQuery(list('tender_history', '/tender_history', S.TenderRecord))
export const useConflicts = () => useQuery(list('conflicts', '/conflicts', S.Conflict))
export const useAuditLog = () => useQuery(list('audit_log', '/audit_log', S.AuditEvent))

/** Every write also appends to audit_log, and invalidates everything so all screens refresh. */
function useWrite<V>(fn: (v: V, role: ReturnType<typeof useCurrentUser>['role']) => Promise<{ action: string; target: string }>, after?: (v: V) => void) {
  const qc = useQueryClient()
  const { role } = useCurrentUser()
  return useMutation({
    mutationFn: async (v: V) => {
      const { action, target } = await fn(v, role)
      await send('POST', '/audit_log', { id: `AUD-${Date.now()}`, at: new Date().toISOString(), role, action, target })
    },
    onSuccess: (_d, v) => { void qc.invalidateQueries(); after?.(v) },
  })
}

export const useSavePlan = () =>
  useWrite<S.Plan>(async (plan) => {
    await send('PUT', `/plans/${plan.id}`, plan)
    return { action: 'Saved plan', target: plan.project_id }
  })

export const useDeletePlan = () =>
  useWrite<S.Plan>(async (plan) => {
    await send('DELETE', `/plans/${plan.id}`)
    return { action: 'Deleted plan', target: plan.id }
  })

export const useSaveTenderDraft = () =>
  useWrite<S.TenderDraft>(async (d) => {
    await send('PUT', `/tender_drafts/${d.id}`, d)
    return { action: 'Saved tender draft', target: d.project_id }
  })

export const useDeleteTenderDraft = () =>
  useWrite<S.TenderDraft>(async (d) => {
    await send('DELETE', `/tender_drafts/${d.id}`)
    return { action: 'Deleted tender draft', target: d.project_id }
  })

export const useAddEnrichment = () =>
  useWrite<Omit<S.Enrichment, 'id' | 'entered_by_role' | 'status' | 'entered_at'>>(
    async (e, role) => {
      const id = `ENR-${Date.now()}`
      await send('POST', '/enrichments', { ...e, id, entered_by_role: role, status: 'pending', entered_at: new Date().toISOString() })
      return { action: `Entered ${e.field}`, target: e.contract_ref }
    },
    (e) => emit('enrichment:saved', { contractRef: e.contract_ref, field: e.field }),
  )

export const useReviewEnrichment = () =>
  useWrite<{ id: string; status: 'approved' | 'rejected' }>(async (v) => {
    await send('PATCH', `/enrichments/${v.id}`, { status: v.status })
    return { action: `${v.status === 'approved' ? 'Approved' : 'Rejected'} entry`, target: v.id }
  })

export const useAddAmendment = () =>
  useWrite<Omit<S.Amendment, 'id' | 'status' | 'entered_by_role'>>(async (a, role) => {
    await send('POST', '/amendments', { ...a, id: `AMD-${Date.now()}`, status: 'pending', entered_by_role: role })
    return { action: 'Entered amendment', target: a.contract_ref }
  })

export const useReviewAmendment = () =>
  useWrite<{ id: string; status: 'approved' | 'rejected' }>(async (v) => {
    await send('PATCH', `/amendments/${v.id}`, { status: v.status })
    return { action: `${v.status === 'approved' ? 'Approved' : 'Rejected'} amendment`, target: v.id }
  })

export const useAssignAlert = () =>
  useWrite<{ id: string; assignee: string }>(
    async (v) => {
      const body = { id: v.id, assignee: v.assignee, status: 'assigned' }
      // json-server PUT 404s for a new id, so the first assignment creates the row.
      await send('PUT', `/alerts/${v.id}`, body).catch(() => send('POST', '/alerts', body))
      return { action: `Assigned alert to ${v.assignee}`, target: v.id }
    },
    (v) => emit('alert:assigned', { alertId: v.id, assignee: v.assignee }),
  )

export const useSubmitFeedback = () =>
  useWrite<{ target_id: string; rating: 'helpful' | 'not_helpful'; reason: string }>(
    async (f, role) => {
      const id = `FB-${Date.now()}`
      await send('POST', '/feedback', { ...f, id, role, status: 'new', created_at: new Date().toISOString() })
      return { action: `Feedback: ${f.rating.replace('_', ' ')}`, target: f.target_id }
    },
    (f) => emit('feedback:submitted', { feedbackId: 'new', targetId: f.target_id }),
  )

export const useReviewFeedback = () =>
  useWrite<{ id: string; status: 'accepted' | 'rejected' | 'edited'; reason?: string }>(async (v) => {
    await send('PATCH', `/feedback/${v.id}`, v.reason === undefined ? { status: v.status } : { status: v.status, reason: v.reason })
    return { action: `Feedback ${v.status}`, target: v.id }
  })

/** Simulated fetch: no network call to a real source, labelled as simulated everywhere. */
export const useFetchSource = (asOf: string) =>
  useWrite<{ id: string }>(async (v) => {
    await send('PATCH', `/sources/${v.id}`, { status: 'fetched', last_fetched: asOf, simulated: true })
    return { action: 'Simulated fetch', target: v.id }
  })

export const useResolveConflict = () =>
  useWrite<{ conflict: S.Conflict; keep: 'public' | 'entered' }>(async ({ conflict, keep }) => {
    const resolution = keep === 'public' ? 'Kept the public value; entered value rejected' : 'Kept the entered value; flagged for follow-up'
    await send('PATCH', `/conflicts/${conflict.id}`, { status: 'resolved', resolution })
    if (keep === 'public') await send('PATCH', `/enrichments/${conflict.entered_ref}`, { status: 'rejected' })
    return { action: `Resolved conflict: ${resolution}`, target: conflict.id }
  })

export const useAddSourceLink = () =>
  useWrite<Omit<S.SourceLink, 'id' | 'checked_at' | 'added_by_role'> & { checked_at?: string }>(async (l, role) => {
    const id = `LNK-${Date.now()}`
    await send('POST', '/source_links', { ...l, id, checked_at: l.checked_at ?? new Date().toISOString(), added_by_role: role })
    return { action: 'Added source link', target: `${l.project_id} · ${l.host}` }
  })

export const useRecordIngestionRun = () =>
  useWrite<Omit<S.IngestionRun, 'id' | 'ran_at' | 'simulated'>>(async (r) => {
    await send('POST', '/ingestion_runs', { ...r, id: `RUN-${Date.now()}`, ran_at: new Date().toISOString(), simulated: true })
    return { action: 'Ran ingestion (simulated)', target: r.link_id }
  })
