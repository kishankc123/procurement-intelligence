// The monitoring and learning features a user can add to their own lifecycle. Pure data, so the server and the app share one list.
export interface FeatureOption { id: string; title: string; what: string; uses: string }

/** The monitoring features the app already has as cards. Adding one to a lifecycle means "I will track my project with this". */
export const MONITORING_OPTIONS: FeatureOption[] = [
  { id: 'disbursement-chart', title: 'Disbursement against time chart', what: 'The share of money disbursed against the share of time used, from each supervision report, with the lag that raises an alert.', uses: 'Supervision reports' },
  { id: 'project-schedule', title: 'Project schedule', what: 'The planned and actual progress of each activity on a timeline, with the ones running behind flagged.', uses: 'Schedule items entered by the team' },
  { id: 'early-warning', title: 'Early-warning board', what: 'Alerts for a rating drop, a risk increase, a disbursement lag, a contract past its end date and many amendments, urgent ones first, each assignable.', uses: 'Supervision reports, contracts, amendments' },
]

/** The learning features: how the assistant's suggestions are rated and reviewed. */
export const LEARNING_OPTIONS: FeatureOption[] = [
  { id: 'feedback-queue', title: 'Feedback queue', what: 'Every suggestion can be rated Helpful or Not helpful; reviewers accept, edit or reject each one, and every decision is logged.', uses: 'Ratings from users, reviewers' },
  { id: 'learning-figures', title: 'Learning figures', what: 'How many pieces of feedback came in, how many were reviewed and how many accepted, worked out from the queue.', uses: 'The feedback queue' },
]
