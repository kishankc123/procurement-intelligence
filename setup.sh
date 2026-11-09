#!/usr/bin/env bash
# Reinstalls every dependency after node_modules has been deleted.
#   ./setup.sh
# Reads the package.json files and pnpm-lock.yaml (the exact pinned versions) for the whole monorepo.
set -euo pipefail
cd "$(dirname "$0")"
export PATH="$HOME/.npm-global/bin:$PATH"

# Node 22 is required (see "engines" in package.json).
node_major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$node_major" != "22" ]; then
  echo "Warning: Node 22.x expected, found $(node -v)." >&2
fi

# pnpm 9.15.9 is pinned in package.json "packageManager"; corepack installs that exact version.
if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@9.15.9 --activate
fi

# --frozen-lockfile installs exactly what pnpm-lock.yaml says and fails if it is out of date.
pnpm install --frozen-lockfile

[ -f .env.local ] || echo "Note: .env.local is missing. Copy .env.example to .env.local and fill in the keys."
echo "Done. Start the demo with ./run.sh"
