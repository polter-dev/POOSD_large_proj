# POOSD_large_proj
[![CI](https://github.com/polter-dev/POOSD_large_proj/actions/workflows/ci.yml/badge.svg)](https://github.com/polter-dev/POOSD_large_proj/actions/workflows/ci.yml)
Team 6 | Large Project POOSD UCF

**Menu Macro Fitter**: a web + mobile app for students who want to lose,
maintain, or gain weight while eating near campus. Users enter their height,
weight, age, sex, and activity level; the app calculates their daily
maintenance calories and a goal target. They then search restaurants within
5, 10, 15, or 20 miles and see menu items that fit, ranked as high-protein or
high-carb options under a per-meal calorie limit. They can also log meals and track daily calories and macros, get a day or week meal plan, log a meal from a photo, and suggest menu corrections, new items or new restaurants for admin review.

Built on the MERN stack (MongoDB, Express, React, Node.js) with a Flutter
mobile client. Calorie targets are general estimates, not medical advice.

## Repository layout

| Folder | What lives there | Small-project equivalent |
|---|---|---|
| `backend/` | Express + Node REST API, Mongoose models, JWT auth, email (SendGrid) | `API/` |
| `backend/src/services/` | Our own logic: calorie calculation and menu ranking (unit tested) | — (new) |
| `backend/src/integrations/` | Maps/places API client for the nearby-restaurant search | — (new) |
| `backend/db/` | Seed script and example queries | `API/sql/` |
| `backend/db/menu-data/` | Menu nutrition data entered from chain sources (estimates labeled) | — (new) |
| `web/` | React + TypeScript web client (Vite, Tailwind) | `frontend/` |
| `mobile/` | Flutter app that calls the same API | — (new) |
| `docs/` | API contract, SwaggerHub spec, PlantUML diagrams, Gantt, wireframes, test results, slides | `docs/` |

## Requirements checklist

- [x] Login/Register is the first screen on web and mobile
- [x] Email verification before first login + password reset
- [x] JWT on every protected route
- [x] Server-side search API with partial matching
- [x] Web client uses async (AJAX) API calls, written in TypeScript + React
- [x] Flutter mobile app with the same design as the web app
- [x] Deployed (e.g. Digital Ocean) and reached by **domain name**, not an IP
- SwaggerHub demo of 1–2 endpoints (at least one live)
  - [x] OpenAPI spec: [`docs/swagger/menu-macro-fitter.yaml`](docs/swagger/menu-macro-fitter.yaml)
  - [ ] Live SwaggerHub demo (done at the presentation)
- Docs
  - [x] Gantt: [`docs/diagrams/gantt.puml`](docs/diagrams/gantt.puml)
  - [x] ERD: [`docs/diagrams/erd.puml`](docs/diagrams/erd.puml)
  - [x] Use-case: [`docs/diagrams/use-case.puml`](docs/diagrams/use-case.puml)
  - [x] Sequence/activity: [`docs/diagrams/`](docs/diagrams/README.md) (auth and recommendations sequences, ranking activity)
  - [ ] Mobile class diagram
  - [x] Unit + integration test results: [`docs/test-results/`](docs/test-results/)
  - [x] Web + mobile prototypes: [`docs/wireframes/`](docs/wireframes/) (Figma links in its README)

## Secrets

`backend/.env` and `web/.env` are git-ignored. Copy the matching
`.env.example`, then fill in the real values. Never commit real secrets.

## Getting started

All three apps are set up; install and run each one locally.

**Backend** (API on http://localhost:5050/api), see [`backend/README.md`](backend/README.md). Needs a MongoDB
loaded once with `backend/db/schema.js` and `seed.js` ([`backend/db/README.md`](backend/db/README.md)).

**Web** (http://localhost:5173), see [`web/README.md`](web/README.md):

```bash
cd web && npm install
cp .env.example .env   # VITE_API_URL=http://localhost:5050/api
npm run dev
```

**Mobile** (Android), see [`mobile/README.md`](mobile/README.md).

Deploying to the droplet: [`docs/deploy.md`](docs/deploy.md).

## AI Assistance Disclosure

Format: see `AI Disclosure Template.md`. Add an entry for each use.

- **Tool**: Claude Opus 5.5 (Anthropic), via Claude Code in VS Code
- **Dates**: October 27-28, 2026
- **Scope**: Backend auth endpoints (register, login, email verification, password reset), the JWT middleware,
  `POST /restaurants/nearby` with chain matching, their unit and integration tests, and the matching doc updates
  (`backend/README.md`, `docs/api-contract.md`, `docs/deploy.md`); PR #71
- **Use**: Code and test generation from `docs/api-contract.md` and issues #12, #13, #21, #30 and #65; code review;
  end-to-end checks against a local MongoDB loaded with `db/schema.js` and `db/seed.js`. Those commits are marked
  `Co-Authored-By: Claude`.
