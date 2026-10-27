# ADR 1: Vite + Module Federation micro-frontends

**Decision:** one Vite shell hosting remotes through `@module-federation/vite`, not Next.js.
**Why:** federation is not reliably supported with the Next.js App Router, and the assessment rewards real federation.
**Shared singletons:** react, react-dom, react-router, @tanstack/react-query, zustand, and the `@pi/*` workspace packages. This keeps one QueryClient (a mutation in one remote refreshes all), one UI store and one event bus.
**Fallback (D2):** not needed. If federation breaks, remotes can become lazy-loaded workspace packages with the same boundaries.
