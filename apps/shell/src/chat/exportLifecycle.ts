import { docxKit, type DocxPart } from '../docxKit'
import { LIFECYCLE_STEPS } from '@pi/config'
import { lifecycleStatus, type LifecycleItem, type LifecycleStage } from '@pi/data'
import { ClausesDetail, PlanDetail, RowsDetail, TimelineDetail } from './lifecycleDetail'

const fmt = (v: number | string) => (typeof v === 'number' ? v.toLocaleString('en-US') : v)

/**
 * The user's whole lifecycle as a Word file (opens in Word, and in Google Docs via Drive > Open with). Every stage is listed, empty ones too, and each item
 * keeps its basis. The docx library is loaded only when the button is pressed so it stays out of the main bundle.
 */
export async function downloadLifecycleDocx(name: string, items: LifecycleItem[]) {
  const { para, heading, table, save } = await docxKit()

  const itemBody = (i: LifecycleItem) => {
    const out: DocxPart[] = []
    const plan = i.kind === 'plan' ? PlanDetail.safeParse(i.detail) : null
    if (plan?.success) {
      const p = plan.data.plan
      out.push(table(['Field', 'Value'], [
        ['Plan', p.name], ['Category', p.category], ['Method', p.method], ['Advertisement', p.planned_advertisement],
        ['Bid opening', p.planned_bid_opening], ['Evaluation complete', p.planned_evaluation_complete], ['Signing', p.planned_signing],
      ]))
      return out
    }
    const clauses = i.kind === 'tender-clauses' ? ClausesDetail.safeParse(i.detail) : null
    if (clauses?.success) {
      out.push(table(['Clause', 'Value', 'Source'], clauses.data.clauses.map((c) => [c.label, `${fmt(c.value)}${c.unit ? ` ${c.unit}` : ''}`, c.source === 'mock' ? 'Demonstration' : c.source === 'real' ? 'Real data' : ''])))
      return out
    }
    const rows = i.kind === 'estimates' ? RowsDetail.safeParse(i.detail) : null
    if (rows?.success) {
      const timeline = TimelineDetail.safeParse((i.detail as { timeline?: unknown } | null)?.timeline)
      if (timeline.success) {
        out.push(para(`Project completion ${timeline.data.completion}${timeline.data.assumed ? ' (assumed: 10 years from the day it was made)' : ''}.`))
        if (timeline.data.overrun) out.push(para('Procurement would finish after the project completion date.', { bold: true }))
        out.push(table(['Milestone', 'Date', 'How it was worked out'], timeline.data.milestones.map((m) => [m.label, m.date, m.how])))
        out.push(para(''))
      }
      out.push(table(['Estimate', 'Value', 'Sample'], rows.data.rows.filter((r) => r.value !== null).map((r) => [r.metric, `${fmt(r.value as number | string)}${r.unit ? ` ${r.unit}` : ''}`, `n=${r.n} ${r.counts}${r.thin ? ' (thin sample)' : ''}`])))
      return out
    }
    out.push(para(i.summary))
    return out
  }

  const { byStage } = lifecycleStatus(items)
  const children: DocxPart[] = [
    heading(name, 'title'),
    para(`Made ${new Date().toISOString().slice(0, 10)}. Everything here is a suggestion the user chose to add, with the basis it came with. Estimates are reference medians, not forecasts.`, { italics: true }),
  ]
  for (const step of LIFECYCLE_STEPS) {
    const stageItems = byStage[step.id as LifecycleStage]
    children.push(heading(step.label, 1))
    if (stageItems.length === 0) children.push(para('Nothing added yet.', { italics: true }))
    for (const i of stageItems) {
      children.push(heading(i.title, 2), para(`Basis: ${i.basis}`, { italics: true }), ...itemBody(i))
    }
  }
  await save(name, children)
}
