#!/usr/bin/env bash
# Runs the whole system: mock API (:3001), shell (:5173) and the four remotes (:5174-5177).
#   ./run.sh         demo mode: reset data, build, serve the production build (use this to present)
#   ./run.sh dev     dev mode: hot reload, no build
#   ./run.sh keep    like demo, but keep the current mock/db.json instead of resetting it
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.npm-global/bin:$PATH"

mode="${1:-demo}"

# Free the ports in case an earlier run is still alive.
for port in 3001 5173 5174 5175 5176 5177; do
  pids=$(lsof -ti tcp:"$port" || true)
  [ -n "$pids" ] && kill $pids 2>/dev/null || true
done

[ "$mode" != "keep" ] && pnpm reset-db

trap 'kill 0' EXIT INT TERM
pnpm api &

if [ "$mode" = "dev" ]; then
  pnpm dev
else
  pnpm build
  pnpm preview
fi
