import { describe, expect, it } from 'vitest'
import { LIFECYCLE_STEPS } from '@pi/config'
import { AssistantReply, STAGES, STAGE_LABEL, TOOLS, answer, detectIntent, resolveProject, withDefaults, type AssistantDb } from './assistant'
import type { Contract, Project } from './schemas'

const project = (id: string, name: string, country: string, practice: string) => ({ project_id: id, project_name: name, borrower_country: country, project_global_practice: practice }) as Project
const contract = (ref: string, pid: string) => ({ borrower_contract_reference_number: ref, project_id: pid, supplier_contract_amount_usd: 1000 }) as Contract

const db: AssistantDb = {
  projects: [
    project('P-MOCK-001', 'Mock Road Rehabilitation Project', 'Romania', 'Transport'),
    project('P-MOCK-002', 'Mock Rural Water Supply Program', 'Estonia', 'Water'),
    project('P-MOCK-003', 'Mock Urban Health Clinics Upgrade', 'Romania', 'Health'),
  ],
  contracts: [contract('R1', 'P-MOCK-001'), contract('R2', 'P-MOCK-001'), contract('W1', 'P-MOCK-002')],
  plans: [], tender_drafts: [], supervision_reports: [], completion_reports: [], documents: [], chunks: [], amendments: [], contract_milestones: [], feedback: [], sources: [], enrichments: [], conflicts: [],
}

describe('resolveProject', () => {
  it('matches a project id', () => {
    expect(resolveProject('help me with p-mock-002 please', db)).toMatchObject({ kind: 'project', project: { project_id: 'P-MOCK-002' } })
  })
  it('matches by the words of the name, ignoring plurals and filler', () => {
    expect(resolveProject('Help me with the road project', db)).toMatchObject({ kind: 'project', project: { project_id: 'P-MOCK-001' } })
    expect(resolveProject('I want to work on health clinic', db)).toMatchObject({ kind: 'project', project: { project_id: 'P-MOCK-003' } })
  })
  it('asks when the words fit more than one project', () => {
    const r = resolveProject('something in Romania', db)
    expect(r.kind).toBe('ambiguous')
    if (r.kind === 'ambiguous') expect(r.projects.map((p) => p.project_id)).toEqual(['P-MOCK-001', 'P-MOCK-003'])
  })
  it('takes the project with the most contracts when the user names none but wants one', () => {
    expect(resolveProject('help me with one of the mock projects', db)).toMatchObject({ kind: 'default', project: { project_id: 'P-MOCK-001' } })
  })
  it('keeps "one of the mock projects" among the mock ones even when a real project has more contracts', () => {
    const real = project('P158504', 'Lao Road Sector Project 2', 'Lao PDR', 'Transport')
    const many = Array.from({ length: 9 }, (_, i) => contract(`L${i}`, 'P158504'))
    const mixed = { projects: [...db.projects, real], contracts: [...db.contracts, ...many] }
    expect(resolveProject('help me with one of the mock projects', mixed)).toMatchObject({ kind: 'default', project: { project_id: 'P-MOCK-001' } })
    expect(resolveProject('pick any project for me', mixed)).toMatchObject({ kind: 'default', project: { project_id: 'P158504' } })
  })
  it('finds nothing for an unrelated message', () => {
    expect(resolveProject('what is the weather', db).kind).toBe('none')
  })
})

describe('answer', () => {
  it('returns a dossier and the service steps for a named project, and the reply is valid and simulated', () => {
    const r = answer(db, 'help me with the water program')
    expect(AssistantReply.safeParse(r).success).toBe(true)
    expect(r.simulated).toBe(true)
    expect(r.dossier?.projectId).toBe('P-MOCK-002')
    expect(r.dossier?.counts.contracts).toBe(1)
    expect(r.steps[0]?.id).toBe('understand')
    expect(r.steps.map((s) => s.id)).toContain('contracts')
    expect(r.reply).toContain('ready')
  })
  it('says which project it picked when none was named', () => {
    const r = answer(db, 'any mock project')
    expect(r.steps[0]?.detail).toContain('No project was named')
    expect(r.dossier?.projectId).toBe('P-MOCK-001')
  })
  it('lists the options and no dossier when it cannot tell', () => {
    const r = answer(db, 'hello')
    expect(r.dossier).toBeNull()
    expect(r.options).toHaveLength(3)
    expect(r.steps).toEqual([])
  })
})

describe('detectIntent', () => {
  it('reads the four lifecycle stages from everyday words', () => {
    expect(detectIntent('show me the plan timeline')).toBe('planning')
    expect(detectIntent('I need a tender draft')).toBe('tender-design')
    expect(detectIntent('any warning signals or alerts?')).toBe('monitoring')
    expect(detectIntent('how is the disbursement going')).toBe('monitoring')
    expect(detectIntent('what did users say, any feedback')).toBe('learning')
  })
  it('gives the whole lifecycle when asked for the entire timeline, before a single stage', () => {
    expect(detectIntent('show me the entire timeline')).toBe('lifecycle')
    expect(detectIntent('all the stages please')).toBe('lifecycle')
    expect(detectIntent('what is the full lifecycle')).toBe('lifecycle')
  })
  it('has no intent for small talk', () => {
    expect(detectIntent('hello there')).toBeNull()
  })
})

describe('answer with intents', () => {
  it('shows a stage for the project in the conversation, with a block and no full gathering', () => {
    const r = answer(db, 'show me the plan timeline', 'P-MOCK-002')
    expect(AssistantReply.safeParse(r).success).toBe(true)
    expect(r.projectId).toBe('P-MOCK-002')
    expect(r.blocks).toEqual([{ type: 'stage', step: 'planning', projectId: 'P-MOCK-002' }])
    expect(r.dossier).toBeNull()
    expect(r.steps.length).toBe(1)
  })
  it('says how many plans it found for the planning stage, and says so plainly when there are none', () => {
    const withPlans = { ...db, plans: [{ project_id: 'P-MOCK-001' }, { project_id: 'P-MOCK-001' }] as AssistantDb['plans'] }
    expect(answer(withPlans, 'show planning', 'P-MOCK-001').reply).toContain('I found 2 procurement plans')
    expect(answer(db, 'show planning', 'P-MOCK-001').reply).toContain('no procurement plans')
  })
  it('says how many supervision reports the monitoring stage has, or that there are none', () => {
    const withReports = { ...db, supervision_reports: [{ project_id: 'P-MOCK-001' }, { project_id: 'P-MOCK-001' }, { project_id: 'P-MOCK-001' }] as AssistantDb['supervision_reports'] }
    expect(answer(withReports, 'show monitoring', 'P-MOCK-001').reply).toContain('has 3 supervision reports')
    expect(answer(db, 'show monitoring', 'P-MOCK-001').reply).toContain('no supervision reports')
  })
  it('counts the feedback for the learning stage, or says nobody has rated anything', () => {
    const rated = { ...db, feedback: [{ status: 'accepted' }, { status: 'new' }, { status: 'rejected' }] as AssistantDb['feedback'] }
    expect(answer(rated, 'show learning', 'P-MOCK-001').reply).toContain('3 pieces of feedback')
    expect(answer(rated, 'show learning', 'P-MOCK-001').reply).toContain('2 reviewed and 1 accepted')
    expect(answer(db, 'show learning', 'P-MOCK-001').reply).toContain('Nobody has rated')
  })
  it('lets a named project win over the one in the conversation', () => {
    const r = answer(db, 'show tender design for the health clinics', 'P-MOCK-001')
    expect(r.blocks).toEqual([{ type: 'stage', step: 'tender-design', projectId: 'P-MOCK-003' }])
  })
  it('shows the whole lifecycle as one block', () => {
    const r = answer(db, 'show me the entire timeline', 'P-MOCK-001')
    expect(r.blocks).toEqual([{ type: 'lifecycle', projectId: 'P-MOCK-001' }])
  })
  it('asks which project when a stage is requested and none is known, and the choices repeat the request', () => {
    const r = answer(db, 'show me monitoring')
    expect(r.blocks).toEqual([])
    expect(r.options).toHaveLength(3)
    expect(r.options[0]?.prompt).toBe('Show monitoring for Mock Road Rehabilitation Project')
  })
  it('gathers the full dossier and shows the ready block when a project is named without a stage', () => {
    const r = answer(db, 'help me with the road project')
    expect(r.blocks).toEqual([{ type: 'ready', projectId: 'P-MOCK-001' }])
    expect(r.dossier?.projectId).toBe('P-MOCK-001')
  })
  it('uses the project in the conversation for small talk with no intent, by listing options', () => {
    const r = answer(db, 'thanks', 'P-MOCK-001')
    expect(r.blocks).toEqual([])
    expect(r.options.length).toBe(3)
  })
})

describe('stages', () => {
  it('match the lifecycle steps the donut shows', () => {
    expect([...STAGES]).toEqual(LIFECYCLE_STEPS.map((s) => s.id))
    expect(Object.entries(STAGE_LABEL)).toEqual(LIFECYCLE_STEPS.map((s) => [s.id, s.label]))
  })
})

describe('tools', () => {
  const sup = (id: string) => ({ supplier_id: id }) as Contract
  const withContracts = { ...db, contracts: [{ ...contract('R1', 'P-MOCK-001'), supplier_id: 'S1' }, { ...contract('R2', 'P-MOCK-001'), supplier_id: 'S1' }, { ...contract('R3', 'P-MOCK-001'), supplier_id: 'S2' }, sup('S9')] }
  it('reads the tools from everyday words', () => {
    expect(detectIntent('list the suppliers for this project')).toBe('suppliers')
    expect(detectIntent('show me the project data')).toBe('project-data')
    expect(detectIntent('show the contracts')).toBe('project-data')
    expect(detectIntent('what is the data source?')).toBe('knowledge')
    expect(detectIntent('where does the data come from')).toBe('knowledge')
    expect(detectIntent('open the knowledge base and the documents')).toBe('knowledge')
    expect(detectIntent('any conflicts in the evidence workbench')).toBe('evidence')
    expect(detectIntent('suggest a tender draft')).toBe('tender-design')
  })
  it('lists the suppliers of the project in the conversation', () => {
    const r = answer(withContracts, 'list the suppliers', 'P-MOCK-001')
    expect(r.blocks).toEqual([{ type: 'tool', tool: 'suppliers', projectId: 'P-MOCK-001' }])
    expect(r.reply).toContain('2 suppliers on the 3 contracts')
    expect(AssistantReply.safeParse(r).success).toBe(true)
  })
  it('says plainly when the project has no contracts', () => {
    expect(answer(db, 'show the project data', 'P-MOCK-003').reply).toContain('no contracts on record')
    expect(answer(db, 'list the suppliers', 'P-MOCK-003').reply).toContain('no suppliers to list')
  })
  it('counts approved entries for the project data', () => {
    const enriched = { ...withContracts, enrichments: [{ contract_ref: 'R1', status: 'approved' }, { contract_ref: 'R1', status: 'approved' }, { contract_ref: 'R2', status: 'pending' }] as AssistantDb['enrichments'] }
    expect(answer(enriched, 'show the project data', 'P-MOCK-001').reply).toContain('1 of 3 contracts have approved entries')
  })
  it('answers where the data comes from, with or without a project, and says when no source is registered', () => {
    const registered = { ...db, sources: [{ name: 'Mock contract awards extract' }, { name: 'GPPD country profiles' }] as AssistantDb['sources'], meta: { dataset_label: 'Mock data' } }
    const r = answer(registered, 'what is the data source?')
    expect(r.blocks).toEqual([{ type: 'tool', tool: 'knowledge', projectId: null }])
    expect(r.reply).toContain('2 registered sources')
    expect(r.reply).toContain('Nothing is fetched live')
    expect(answer(db, 'what is the data source?').reply).toContain('No sources are registered')
  })
  it('shows the evidence workbench only when asked, and says there is nothing when no conflict exists', () => {
    expect(answer(db, 'show the evidence workbench').blocks).toEqual([{ type: 'tool', tool: 'evidence', projectId: null }])
    expect(answer(db, 'show the evidence workbench', 'P-MOCK-001').reply).toContain('nothing to resolve')
  })
  it('asks which project when the suppliers are requested with none known, and the choices repeat the request', () => {
    const r = answer(db, 'list the suppliers')
    expect(r.blocks).toEqual([])
    expect(r.options[0]?.prompt).toBe('Show the suppliers for Mock Road Rehabilitation Project')
  })
  it('offers follow-ups: everything except the thing just shown, and a starter list without a project', () => {
    const shown = answer(db, 'show monitoring', 'P-MOCK-001').suggestions
    expect(shown).not.toContain('Show monitoring')
    expect(shown).toContain('List the suppliers')
    expect(answer(db, 'hello').suggestions).toContain('What is the data source?')
    expect(answer(db, 'what is the data source?').suggestions).not.toContain('What is the data source?')
    expect([...TOOLS].length).toBe(4)
  })
})

describe('missing data', () => {
  it('treats missing collections as empty instead of throwing', () => {
    expect(withDefaults(undefined).projects).toEqual([])
    expect(withDefaults({ projects: db.projects }).contracts).toEqual([])
    for (const message of ['hello', 'help me with one of the mock projects', 'show the plan timeline', 'list the suppliers', 'what is the data source?', 'show the evidence workbench']) {
      expect(() => answer({}, message, 'P-MOCK-001')).not.toThrow()
      expect(() => answer({ projects: db.projects }, message, 'P-MOCK-001')).not.toThrow()
    }
  })
  it('says there are no projects when there are none', () => {
    expect(answer({}, 'hello').reply).toContain('no projects')
  })
})
