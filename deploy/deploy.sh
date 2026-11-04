#!/usr/bin/env bash
# Run ON the droplet from anywhere: bash deploy/deploy.sh. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

git pull --ff-only

(cd backend && npm ci --omit=dev)

# Bring the database's validators and indexes up to this commit's backend/db/schema.js before the new API
# starts. Without it a field added to schema.js (e.g. trackedNutrients, #107) is rejected by the old
# validator and the API answers 500. schema.js is safe to re-run: collMod, createIndex no-ops, no data loss.
command -v mongosh >/dev/null || { echo "mongosh not found: install mongodb-mongosh (docs/deploy.md step 4)" >&2; exit 1; }
MONGODB_URI=$(sed -n 's/^MONGODB_URI=//p' backend/.env | tail -n 1 | sed -e 's/^["'\'']//' -e 's/["'\'']$//')
[ -n "$MONGODB_URI" ] || { echo "MONGODB_URI is not set in backend/.env" >&2; exit 1; }
(cd backend/db && mongosh --quiet "$MONGODB_URI" schema.js)

# nginx serves web/dist. Without web/.env, Vite would bake "undefined/api" into the build.
[ -f web/.env ] || { echo "missing web/.env: echo 'VITE_API_URL=/api' > web/.env (docs/deploy.md step 6)" >&2; exit 1; }
(cd web && npm ci && npm run build)

# Starts the API on first run, zero-downtime reload after that.
pm2 startOrReload deploy/ecosystem.config.js
pm2 save
