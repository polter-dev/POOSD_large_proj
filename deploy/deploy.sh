#!/usr/bin/env bash
# Run ON the droplet from anywhere: bash deploy/deploy.sh. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only

(cd backend && npm ci --omit=dev)

# nginx serves web/dist. Without web/.env, Vite would bake "undefined/api" into the build.
[ -f web/.env ] || { echo "missing web/.env: echo 'VITE_API_URL=/api' > web/.env (docs/deploy.md step 6)" >&2; exit 1; }
(cd web && npm ci && npm run build)

# Starts the API on first run, zero-downtime reload after that.
pm2 startOrReload deploy/ecosystem.config.js
pm2 save
