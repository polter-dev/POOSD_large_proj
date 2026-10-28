#!/usr/bin/env bash
# Run ON the droplet from anywhere: bash deploy/deploy.sh. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only

(cd backend && npm ci --omit=dev)

# nginx serves web/dist. Needs web/.env with VITE_API_URL=/api (docs/deploy.md step 6).
(cd web && npm ci && npm run build)

# Starts the API on first run, zero-downtime reload after that.
pm2 startOrReload deploy/ecosystem.config.js
pm2 save
