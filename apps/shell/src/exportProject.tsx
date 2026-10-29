import { useState } from 'react'
import {
  STATUS_LABEL, dataReadiness, plannedDurations, projectPhase, scheduleRows, useContracts, useEnrichments, useMeta, usePlan, usePlanPackages, useProject,
  useReports, useScheduleItems, useTenderDraft, useTenderNotices,
} from '@pi/data'
import { Button } from '@pi/ui'
import { docxKit, type DocxPart } from './docxKit'

const dash = (v: string | number | null | undefined) => (v === null || v === undefined || v === '' ? 'Not on record' : String(v))

/**
 * A stored project's whole record as a Word file: the project facts, then every lifecycle stage with what is stored for it (plans, plan rows read from the
 * World Bank plan, draft clauses, tenders, schedule, supervision reports, contracts). A stage with nothing stored says so; nothing is estimated to fill it.
 */
export function DownloadProject({ projectId, label = 'Download project (.docx)' }: { projectId: string; label?: string }) {
  const project = useProject(projectId).data?.[0]
  const plans = usePlan(projectId).data
  const packages = usePlanPackages(projectId).data
  const draft = useTenderDraft(projectId).data?.[0]
  const notices = useTenderNotices(projectId).data
  const reports = useReports(projectId).data
  const contracts = useContracts(projectId).data
  const items = useScheduleItems().data
  const enrichments = useEnrichments().data
  const asOf = useMeta().data?.as_of_date
  const [state, setState] = useState<'idle' | 'busy' | 'error'>('idle')
  const ready = Boolean(project && asOf && plans && packages && notices && reports && contracts && items && enrichments)

  const run = async () => {
    if (!project || !asOf || !plans || !packages || !notices || !reports || !contracts || !items || !enrichments) return
    setState('busy')
    try {
      const { para, heading, table, save } = await docxKit()
      const none = (text: string) => para(text, { italics: true })
      const rows = scheduleRows(items.filter((i) => i.project_id === projectId), plans, asOf)
      const readiness = dataReadiness(contracts, enrichments)
      const parts: DocxPart[] = [
        heading(project.project_name, 'title'),
        para(`${project.project_id} · ${project.borrower_country} · ${project.project_global_practice} · ${project.region}. Data as of ${asOf}; made ${new Date().toISOString().slice(0, 10)}.`, { italics: true }),
        table(['Fact', 'Value'], [
          ['Approval', project.approval_date],
          ['Effectiveness', `${project.effectiveness_actual ?? project.effectiveness_planned}${project.effectiveness_actual ? '' : ' (planned)'}`],
          ['Closing', `${project.closing_date_revised ?? project.closing_date_planned}${project.closing_date_revised ? ' (revised)' : ''}`],
          ['Phase', projectPhase(project, rows, asOf)],
        ]),

        heading('Planning', 1),
        plans.length === 0 ? none('No plans entered for this project.') : table(['Plan', 'Category', 'Method', 'Advertisement', 'Bid opening', 'Evaluation complete', 'Signing', 'Days to sign'],
          plans.map((p) => [`${p.name} (${p.id})`, p.category, p.method, p.planned_advertisement, p.planned_bid_opening, p.planned_evaluation_complete, p.planned_signing, String(plannedDurations(p).advertisementToSigning)])),
        ...(packages.length > 0 ? [
          para(`Plan rows read from the World Bank plan of ${packages[0]!.plan_date}, copied as the document writes them:`),
          table(['Ref', 'Description', 'Category', 'Method', 'Estimated cost', 'Expected bid opening'],
            packages.map((p) => [dash(p.ref_no), p.description, dash(p.category), dash(p.method), p.estimated_cost ? `${p.estimated_cost}${p.cost_unit ? ` ${p.cost_unit}` : ''}` : 'Not on record', dash(p.expected_bid_opening)])),
        ] : []),

        heading('Tender design', 1),
        !draft ? none('No tender draft saved for this project.') : table(['Clause', 'Value'], [
          ['Contract duration', `${draft.duration_months} months`], ['Bid validity', `${draft.bid_validity_days} days`], ['Performance security', `${draft.performance_security_pct}%`],
          ['Minimum similar contracts', String(draft.min_similar_contracts)], ['Minimum similar value', `${draft.min_similar_value_usd.toLocaleString('en-US')} USD`], ['Evaluation method', draft.evaluation_method],
        ]),
        ...(notices.length > 0 ? [
          para('Tenders published:'),
          table(['Reference', 'Description', 'Method', 'Posted', 'Deadline', 'Status'], notices.map((n) => [n.reference, n.description, n.method, n.posted, dash(n.deadline), n.status])),
        ] : []),

        heading('Monitoring', 1),
        rows.length === 0 ? none('No schedule items for this project.') : table(['Item', 'Group', 'Start', 'End', 'Progress', 'Status'],
          rows.map((r) => [r.name, r.group, r.start, r.end, r.progress === null ? 'None recorded' : `${r.progress}%`, STATUS_LABEL[r.status]])),
        reports.length === 0 ? none('No supervision reports for this project.') : table(['Report', 'Date', 'Progress', 'Implementation', 'Overall risk', 'Fiduciary risk', 'Disbursed', 'Restructurings'],
          [...reports].sort((a, b) => a.sequence - b.sequence).map((r) => [`#${r.sequence}`, r.date, r.progress_rating, r.implementation_rating, r.overall_risk, r.fiduciary_risk, `${r.disbursed_pct}%`, String(r.restructurings.length)])),

        heading('Contracts', 1),
        contracts.length === 0 ? none('No contracts for this project.') : table(['Contract', 'Supplier', 'Category', 'Method', 'Amount (USD)', 'Signed', 'FY'],
          contracts.map((c) => [c.borrower_contract_reference_number, c.supplier, c.procurement_category, c.procurement_method, c.supplier_contract_amount_usd.toLocaleString('en-US'), c.contract_signing_date, String(c.fiscal_year)])),
        ...(readiness.eligible > 0 ? [
          para('Contract data readiness (how many contracts have a usable value):'),
          table(['Field', 'Usable', 'Pending review', 'Not usable', 'Missing'], readiness.rows.map((r) => [r.label, String(r.usable), String(r.pending), String(r.invalid), String(r.missing)])),
        ] : []),
      ]
      await save(`${project.project_id} ${project.project_name}`, parts)
      setState('idle')
    } catch { setState('error') }
  }

  return (
    <Button onClick={() => void run()} disabled={!ready || state === 'busy'} data-export-ignore="" title={state === 'error' ? 'The file could not be made. Try again.' : 'Everything stored for this project as a Word file; opens in Google Docs too'}>
      {state === 'busy' ? 'Preparing…' : state === 'error' ? 'Retry download' : label}
    </Button>
  )
}
