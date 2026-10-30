// Errors shared by the pipeline and the readers it uses (kept apart so they can import each other's types without a cycle).

/** A download the server answered with an HTTP error. The status tells the pipeline whether the document can be skipped (refused, gone) or the run should fail (a server fault). */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = 'HttpError' }
}

/** Statuses that mean "this document is not available to us": it is left without text and the run goes on. Anything else (a timeout, a 5xx) fails the run, so nothing is silently incomplete. */
export const SKIPPABLE_STATUSES = new Set([401, 403, 404, 410, 451])
export const isSkippable = (e: unknown): e is HttpError => e instanceof HttpError && SKIPPABLE_STATUSES.has(e.status)
