#!/usr/bin/env bash
# Run ON the droplet from anywhere: bash deploy/deploy.sh. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only

(cd backend && npm ci --omit=dev)

# web/ is not scaffolded yet (#15); skip it until it has a package.json.
if [ -f web/package.json ]; then
  (cd web && npm ci && npm run build)
fi

# Starts the API on first run, zero-downtime reload after that.
pm2 startOrReload deploy/ecosystem.config.js
pm2 save
