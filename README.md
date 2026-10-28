# POOSD_large_proj
Team 6 | Large Project POOSD UCF

**Menu Macro Fitter**: a web + mobile app for students who want to lose,
maintain, or gain weight while eating near campus. Users enter their height,
weight, age, sex, and activity level; the app calculates their daily
maintenance calories and a goal target. They then search restaurants within
5, 10, 15, or 20 miles and see menu items that fit, ranked as high-protein or
high-carb options under a per-meal calorie limit. No meal logging or food diary.

Built on the MERN stack (MongoDB, Express, React, Node.js) with a Flutter
mobile client. Calorie targets are general estimates, not medical advice.

## Repository layout

| Folder | What lives there | Small-project equivalent |
|---|---|---|
| `backend/` | Express + Node REST API, Mongoose models, JWT auth, email (SendGrid/NodeMailer) | `API/` |
| `backend/src/services/` | Our own logic: calorie calculation and menu ranking (unit tested) | — (new) |
| `backend/src/integrations/` | Maps/places API client for the nearby-restaurant search | — (new) |
| `backend/db/` | Seed script and example queries | `API/sql/` |
| `backend/db/menu-data/` | Menu nutrition data entered from chain sources (estimates labeled) | — (new) |
| `web/` | React + TypeScript web client (Vite, Tailwind) | `frontend/` |
| `mobile/` | Flutter app that calls the same API | — (new) |
| `docs/` | API contract, SwaggerHub spec, PlantUML diagrams, Gantt, wireframes, test results, slides | `docs/` |

## Requirements checklist

- [ ] Login/Register is the first screen on web and mobile
- [ ] Email verification before first login + password reset
- [ ] JWT on every protected route
- [ ] Server-side search API with partial matching
- [ ] Web client uses async (AJAX) API calls, written in TypeScript + React
- [ ] Flutter mobile app with the same design as the web app
- [ ] Deployed (e.g. Digital Ocean) and reached by **domain name**, not an IP
- [ ] SwaggerHub demo of 1–2 endpoints (at least one live)
- [ ] Docs: Gantt, ERD, use-case, sequence/activity, mobile class diagram, unit + integration test results, web + mobile prototypes

## Secrets

`backend/.env` and `web/.env` are git-ignored. Copy the matching
`.env.example`, then fill in the real values. Never commit real secrets.

## Getting started

All three apps are set up; install and run each one locally.

**Backend** (API on http://localhost:5050/api). Needs a MongoDB loaded once with
`backend/db/schema.js` and `seed.js`, see [`backend/db/README.md`](backend/db/README.md).

```bash
cd backend && npm install
cp .env.example .env   # set MONGODB_URI and JWT_SECRET
npm run dev
```

**Web** (http://localhost:5173), see [`web/README.md`](web/README.md):

```bash
cd web && npm install
cp .env.example .env   # VITE_API_URL=http://localhost:5050/api
npm run dev
```

**Mobile** (Android), see [`mobile/README.md`](mobile/README.md).

Deploying to the droplet: [`docs/deploy.md`](docs/deploy.md).

## AI Assistance Disclosure

See `AI Disclosure Template.md`.
