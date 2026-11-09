// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { withDefaults } from '../packages/data/src/assistant'
import { buildTools, SYSTEM_PROMPT } from './copilot'

const db = withDefaults(JSON.parse(readFileSync(new URL('../mock/db.json', import.meta.url), 'utf8')))
const tools = buildTools(() => db) as unknown as { name: string; description: string; parameters: unknown; execute: (args: Record<string, unknown>) => Promise<any> }[]
const byName = (n: string) => tools.find((t) => t.name === n)!

/** Tools the browser provides (CopilotPanel.tsx), which the instructions may name. */
const FRONTEND_TOOLS = ['show_stage', 'show_tool', 'show_lifecycle', 'show_map', 'show_compare', 'show_my_lifecycle', 'set_project_context', 'edit_my_lifecycle']

describe('the instructions and the tools agree', () => {
  const mentioned = [...new Set(SYSTEM_PROMPT.match(/\b(?:analyse|find|get|show|propose|scan|search|semantic|set|edit|list)_[a-z_]+\b/g) ?? [])].filter((n) => !/_\*$/.test(n))

  it('every tool the instructions name exists, on the server or in the browser', () => {
    const panel = readFileSync(new URL('../apps/shell/src/chat/CopilotPanel.tsx', import.meta.url), 'utf8')
    for (const name of mentioned) {
      const known = tools.some((t) => t.name === name) || (FRONTEND_TOOLS.includes(name) && panel.includes(`'${name}'`))
      expect(known, `${name} is named in the instructions but is not a tool`).toBe(true)
    }
  })
  it('the analytical tools are registered, described and have parameters', () => {
    for (const n of ['analyse_project', 'analyse_project_risks', 'get_data_gaps', 'find_comparable_projects', 'scan_risk_evidence', 'get_plan_packages', 'find_tender_notices']) {
      expect(byName(n), n).toBeTruthy()
      expect(byName(n).description.length, n).toBeGreaterThan(80)
      expect(byName(n).parameters, n).toBeTruthy()
    }
    expect(new Set(tools.map((t) => t.name)).size).toBe(tools.length)
  })
  it('the instructions name the analytical tools they rely on', () => {
    for (const n of ['analyse_project', 'analyse_project_risks', 'get_data_gaps', 'find_comparable_projects', 'scan_risk_evidence', 'semantic_search_documents']) expect(mentioned, n).toContain(n)
  })
})

describe('the analyst standard in the instructions', () => {
  it('has the rules for context, analysis, labelling, gaps, comparisons, risks and lifecycle', () => {
    for (const marker of ['N. Understand the context first', 'O. Analyse; do not display', 'P. Say what kind of statement', 'Q. Gaps are findings', 'R. Argue every comparison', 'S. Risks, by relevance', 'T. Lifecycle recommendations']) expect(SYSTEM_PROMPT, marker).toContain(marker)
  })
  it('asks for the analytical shape and the evidence ids', () => {
    expect(SYSTEM_PROMPT).toMatch(/Finding.*Evidence.*What it means for this project.*What to check or do next/s)
    expect(SYSTEM_PROMPT).toMatch(/Assumptions:/)
    expect(SYSTEM_PROMPT).toMatch(/at most two targeted questions/)
  })
  it('forbids invented probabilities and causes, and says gaps come in kinds', () => {
    expect(SYSTEM_PROMPT).toMatch(/never give a probability, score, likelihood or expected outcome/)
    expect(SYSTEM_PROMPT).toMatch(/not as a cause|as a cause/)
    for (const kind of ['not published by the public sources', 'not retrieved', 'could not be verified', 'not found']) expect(SYSTEM_PROMPT, kind).toContain(kind)
    expect(SYSTEM_PROMPT).toMatch(/Never fill a gap with an estimate/)
  })
  it('no longer caps analytical answers at one or two sentences or tells the assistant not to ask questions', () => {
    expect(SYSTEM_PROMPT).not.toMatch(/After a view is on screen, add one or two sentences/)
    expect(SYSTEM_PROMPT).not.toMatch(/After a proposal card is on screen, reply with at most two short sentences/)
    expect(SYSTEM_PROMPT).not.toMatch(/Do not ask clarifying questions before estimating/)
    expect(SYSTEM_PROMPT).not.toMatch(/Keep answers short and in plain language/)
  })
  it('keeps the guardrails: real versus mock, review versus suggest, honesty, and no drafts for stored projects', () => {
    expect(SYSTEM_PROMPT).toMatch(/B\. Real or mock, never both/)
    expect(SYSTEM_PROMPT).toMatch(/C\. Two modes, never mixed/)
    expect(SYSTEM_PROMPT).toMatch(/Do not propose, suggest, estimate or draft anything for it/)
    expect(SYSTEM_PROMPT).toMatch(/F\. Be honest/)
  })
  it('names the four stages as the user does and says which words the tabs use', () => {
    expect(SYSTEM_PROMPT).toMatch(/Plans executed \(planning\), Tenders published \(tender-design\), Monitoring \(monitoring\) and Lessons learned \(learning\)/)
    expect(SYSTEM_PROMPT).toMatch(/Evaluation and Feedback/)
  })
})

describe('the analytical tools run through the same wiring as the server', () => {
  it('analyse_project returns the brief for a real project, labelled as real data', async () => {
    const out = await byName('analyse_project').execute({ project_id: 'P158504' })
    expect(out.data_kind).toMatch(/real World Bank data/)
    expect(Object.keys(out.stages)).toEqual(['plans_executed', 'tenders_published', 'monitoring', 'lessons_learned'])
    expect(out.risks.length).toBeGreaterThan(0)
    expect(out.comparable_projects.length).toBeGreaterThan(0)
  })
  it('get_data_gaps and analyse_project_risks answer for a real project, and an unknown id is an error the model can pass on', async () => {
    expect((await byName('get_data_gaps').execute({ project_id: 'P102398' })).items.some((i: { status: string }) => i.status === 'not_in_public_sources')).toBe(true)
    expect((await byName('analyse_project_risks').execute({ project_id: 'P158504' })).project_status).toMatch(/closed/)
    expect(await byName('analyse_project').execute({ project_id: 'P999999' })).toMatchObject({ error: 'No project with id P999999.' })
  })
  it('find_comparable_projects works for a stored project and for a procurement described in words, and keeps mock apart', async () => {
    const stored = await byName('find_comparable_projects').execute({ project_id: 'P158504', limit: 3 })
    expect(stored.comparables.length).toBe(3)
    expect(JSON.stringify(stored)).not.toContain('P-MOCK')
    const own = await byName('find_comparable_projects').execute({ country: 'Cambodia', category: 'Works', value_usd: 20_000_000 })
    expect(own.comparables.every((c: { comparability: string }) => c.comparability !== 'closer')).toBe(true)
    const mock = await byName('find_comparable_projects').execute({ scope: 'mock', sector: 'transport' })
    expect(mock.data_kind).toMatch(/mock/)
  })
  it('scan_risk_evidence returns citable passages for real projects, and nothing for an unknown project id', async () => {
    const out = await byName('scan_risk_evidence').execute({ scope: 'real', themes: ['procurement_delay'] })
    expect(out.themes[0].passages.length).toBeGreaterThan(0)
    expect(out.themes[0].passages[0].chunk_id).toMatch(/^CH-WB-/)
    expect((await byName('scan_risk_evidence').execute({ scope: 'real', project_ids: ['P-MOCK-001'] })).themes).toMatch(/^missing/)
  })
  it('a tool that throws answers with a sentence instead of an exception', async () => {
    const broken = (buildTools(() => { throw new Error('data file unreadable') }) as unknown as typeof tools).find((t) => t.name === 'analyse_project')!
    expect((await broken.execute({ project_id: 'P158504' })).error).toMatch(/The tool failed \(data file unreadable\)/)
  })
})
