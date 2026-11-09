// The same CopilotKit runtime, reachable at the bare /api/copilotkit as well. vercel.json rewrites every /api/copilotkit/* path here too,
// so the chat's calls (/info, /agent/default/run, /connect, ...) reach the runtime however Vercel matches catch-all file names.
export { default } from './copilotkit/[...path].mjs'
