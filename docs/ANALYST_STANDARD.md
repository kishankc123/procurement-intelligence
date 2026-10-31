# The analyst standard

The assistant is meant to read the stored evidence and say what it means for the user's project, not to list what is on screen. This file records what was changed to make that so, the rules the new tools apply, and how to check the behaviour with the real model.

*Status: the tools are tested on fixtures and run on the stored projects. The new instructions have not been run against the model (there is no key or network where this was built), so the quality of the written answers is unverified. Use the checklist at the end.*

## What changed

**Instructions (`server/copilot.ts`, rules N to T).** Understand the context first (ask at most two targeted questions, or give a preliminary analysis that starts with its assumptions); analyse rather than display (finding, evidence ids, what it means for this project, what to do next); say whether a statement is documented, derived, an interpretation, or a prediction (there is no forecasting model, so no probabilities, scores or likelihoods, and no correlation presented as a cause); treat a gap as a finding with a kind, a limit, a stand-in and a next step; argue every comparison; rank risks by relevance; keep planned, completed, observed and suggested apart. The rules that capped answers at "one or two sentences", forbade clarifying questions, and said not to restate figures were replaced. The guardrails (real versus mock, review versus suggest, honesty, nothing drafted for a stored project) are unchanged. The agent may now take up to 10 tool steps (it was 6).

**Tools (`packages/data/src/analysis.ts`, registered in `server/copilot.ts`).** All are rule-based and read only the stored data.

| Tool | What it gives | Rule it applies |
|---|---|---|
| `analyse_project` | One brief for a stored project: context, what is on record at the four stages (planned, completed, observed), the top risks, the gaps, the closest comparables | Combines the tools below |
| `analyse_project_risks` | Risks with evidence ids, why they matter, what is uncertain, what to check, and the project's own document sentences on the same theme | Priority rule below; says whether the project has closed |
| `get_data_gaps` | Every stage's records, and for each gap: not published by the public sources, not retrieved, could not be verified, or not found; how it limits the analysis; what can stand in; the next step | Derived from what is stored |
| `find_comparable_projects` | Other stored projects with the dimensions that match, what differs, what history they have, and closer / partial / limited | Comparability rule below |
| `scan_risk_evidence` | Passages in the stored documents that describe a difficulty on a theme (procurement delay, contractor performance, land and safeguards, cost and variations, design and specification, agency capacity, disbursement, extensions and restructuring) | A sentence must name the topic and a problem word together; tables and acronym lists are skipped |

The suggested prompts at the start of a chat include one analytical question about a real project.

## The rules, in one place

**Priority of a risk (higher / moderate / lower).** Not a probability. *Higher*: a threshold is breached in the latest supervision report (a rating at moderately unsatisfactory or worse, a downgrade of two levels or more, disbursement more than 20 points behind the time used, overall risk High), or two separate signals on the same theme are each at least moderate. *Moderate*: one signal over its threshold (overall risk Substantial, a one-level downgrade, a closing date moved 12 or more months, two or more restructurings, one supplier above 60% of committed value, 50% or more of value by direct, single-source or limited selection, approved amendments that add cost). *Lower*: context (a closing date moved 6 to 12 months, a supplier at 40 to 60%, 25 to 50% by less competitive methods). The thresholds are in `RISK_RULES` in `analysis.ts`; the 20-point lag is the app's existing `THRESHOLDS.disbursementLagPoints`. They are judgement calls, not findings, and are stated in every result.

**Comparability (closer / partial / limited).** Each dimension is judged similar, partly similar, different or unknown: sector (only when the stored projects differ in it), country (a different country in the same region is partly similar), scale (similar within 2 times, different at 5 times or more), main procurement category, share procured by less competitive methods, and planned length. *Closer*: at least 4 dimensions compared, at least 75% similar, none different. *Partial*: at least 2 similar, at least half of those compared, at most 1 different. *Limited*: otherwise. A procurement described in a sentence has too few dimensions to reach "closer". A candidate's stage is reported (does it have a completion report?) but does not count for or against: a documented outcome makes a project more useful, not less comparable. The result always says that the sample is small and nothing is statistically significant.

**Kinds of absence.** *Not published by the public sources*: contract amendments, bidder counts, bid dates and tender clauses for a World Bank project; ingesting again will not help. *Not retrieved*: listed or stored but not read, such as the appraisal document, a completion report's lessons (the text is there, the list is not), documents the World Bank site refused, and meaning-based search when nothing is embedded. *Could not be verified*: read but not checkable, such as supervision reports the parser could not turn into ratings, or plan rows not found in their document. *Not found*: nothing stored and no record of why.

## Limits to keep in mind

- Only 7 real projects are stored, all roads, so "comparable" means a few neighbours, and sector does not separate them.
- Structured lessons exist only for the mock projects. For real projects the completion report is searchable text, and the assistant is told to say so rather than list lessons.
- `scan_risk_evidence` is a keyword scan. A matching sentence can say the problem was solved. The result says so, and the assistant is told to read before it relies on a passage.
- The attention levels, comparability rule and thresholds are transparent rules over a handful of projects. They are not a model, and the assistant is told not to present them as one.

## Checking it with the model

Ask these in a chat with the model key set, on a build that includes this change, and compare with what is expected.

1. *"What are the main risks in Lao Road Sector Project 2?"* Expect a call to `analyse_project`; the project called closed and its risks called documented difficulties; the 40-month closing-date move and two restructurings with their report ids; what is uncertain (the reason is in the text, not the record); no probability; at most a few risks, not all.
2. *"Help me plan procurement for a new road project in Cambodia."* Expect assumptions stated up front, at most two questions (value, category or method), comparable projects each with why, and what differs.
3. *"What lessons did the Cambodia project learn?"* (P150572 has no completion report.) Expect "not found" with the closing date, no invented lessons, and an offer to use comparable projects' completion reports.
4. *"How long does procurement usually take from advertisement to signing?"* Expect that it cannot be calculated from the contract awards (only signing dates are published), which dates are needed, and what can stand in.
5. *"Is the Cambodia project comparable to the Lao one?"* Expect an argued answer: which dimensions match, which differ, and the small-sample caveat.
6. *"What is the probability this project is delayed?"* Expect a refusal to give a number and an explanation of what the records do show.
7. A mock project (`P-MOCK-001`): expect it labelled as mock data and never put beside a real one.

Report any answer that lists the screen back, invents a figure or lesson, or states a cause the documents do not state.
