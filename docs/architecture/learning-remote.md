# Micro front-end: `learning` (`apps/learning`, port 5176)

Federation name `learning`. Owns the **feedback loop**: the feedback queue where reviewers decide, the figures worked out from it, the data-readiness and coverage cards, and the update log. Read `README.md` first.

## Exposed modules

| Module | File | What it is | Used by |
|---|---|---|---|
| `./Learning` | `src/Learning.tsx` (default export) | The whole Learning page: feedback figures, the queue, "Contract data readiness", "Data coverage by fiscal year", "Update log" (from `audit_log`) | Shell route `/learning` |
| `./LearningCard` | `src/LearningCard.tsx` | The Learning (Feedback) **stage** as a chat card: how many pieces of feedback, how many reviewed and accepted, then the figures and the queue. Props: `{ projectId }` | `ChatBlocks.tsx` stage view |
| `./LearningFeature` | `src/LearningFeature.tsx` | **One feature at a time**: `feature` is `'feedback-queue'` or `'learning-figures'`; props `{ feature, projectId }` | `MyLifecycle.tsx` (`FeatureView`: learning features a user added to their own lifecycle, and Preview on the option card) |

Types are declared by hand in `apps/shell/src/env.d.ts`. After adding an exposed module, restart this remote's dev server.

## What is inside

- `Learning.tsx` also exports `FeedbackQueueCard` and `feedbackFigures` (used by the two cards above). **`FeedbackQueueCard`** lists every feedback entry (rating, who gave it, status) in a paged table; a reviewer can **Accept**, **Reject** or **Edit** (a note, saved as "edited") each one (`useReviewFeedback`, permission `review_feedback`; disabled with the reason for other roles). The table **stacks on phones** (`.queue` in `Learning.module.css`) so the buttons stay on screen. `feedbackFigures` returns an array of keyed figure cards (total, reviewed, accepted) so a page can show them in a carousel and the chat in a grid; they come from `feedbackKpis` in `@pi/data` and are an empty state when there is no feedback ("nothing is estimated in the meantime").
- A feedback target is named in words (`useFeedbackTitles`): a recommendation title, or the layer or chat card the feedback was given on.

## Where feedback comes from

`FeedbackWidget` (`@pi/domain`, "Helpful / Not helpful") sits under every card in the chat (`BlockView` in the shell) and on the cards of the older pages. Target ids look like `AI-LAYER-chat<layer>-<projectId>` (the layer is read from the third part of the id) or `REC-...` for recommendations. Submitting writes to `feedback` (and `audit_log`) through `useSubmitFeedback` and emits `feedback:submitted` on the event bus. Everything on this remote's screens updates at once because all queries are invalidated after a write.

## Data it uses

Reads: `useFeedback`, `useAuditLog`, `useContracts`, `useEnrichments`, `useRecommendations`, `useUiStore` (project, fiscal year), `useCurrentUser` (role). Writes: `useReviewFeedback`. Pure helpers: `feedbackKpis`, `dataReadiness` (`selectors.ts`).

The queue shows **all** feedback, not only the selected project's, even where it is drawn for a project or for the example project in a user's lifecycle.

## Rules specific to this remote

- KPIs are derived from logs and feedback; with none, show an empty state, never a made-up number.
- No model is trained here; the roadmap is a proposed plan, not a result.

## Files

`Learning.tsx`, `LearningCard.tsx`, `LearningFeature.tsx`, `Learning.module.css`, `bootstrap.tsx` and `main.tsx` (standalone dev entry), `env.d.ts`.

## Tests and checks

`dataReadiness` is tested in `packages/data/src/selectors.test.ts`; `feedbackKpis` (same file) has no direct test. Cards are checked in the browser. `pnpm --filter @pi/learning typecheck`.
