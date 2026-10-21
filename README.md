# POOSD_large_proj
Team 6 | Large Project POOSD UCF

A web + mobile app built on the MERN stack (MongoDB, Express, React, Node.js)
with a Flutter mobile client. Users register (with email verification), log in,
reset their password, and manage their own data. Search runs on the server
with partial matching.

## Repository layout

| Folder | What lives there | Small-project equivalent |
|---|---|---|
| `backend/` | Express + Node REST API, Mongoose models, JWT auth, email (SendGrid/NodeMailer) | `API/` |
| `backend/db/` | Seed script and example queries | `API/sql/` |
| `web/` | React + TypeScript web client (Bootstrap or Tailwind) | `frontend/` |
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

Generate the toolchain files into the existing folders, keeping the stubs:

```bash
cd backend && npm init -y && npm i express mongoose jsonwebtoken bcrypt dotenv cors
cd ../web  && npm create vite@latest . -- --template react-ts
cd ../mobile && flutter create .
```

## AI Assistance Disclosure

See `AI Disclosure Template.md`.
