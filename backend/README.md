# Menu Macro Fitter API (backend)

Express 5 + Mongoose REST API under `/api`. Endpoints, fields and error messages are in
[`docs/api-contract.md`](../docs/api-contract.md); the database, its validators and the seed accounts are in
[`db/README.md`](db/README.md).

## Run it

Needs Node.js LTS and a MongoDB loaded with `db/schema.js` and `db/seed.js` (see `db/README.md`).

```bash
cd backend
npm install
cp .env.example .env    # then set MONGODB_URI and JWT_SECRET
npm run dev             # restarts on save; check http://localhost:5050/api/health
```

| Variable | Needed | Notes |
|---|---|---|
| `MONGODB_URI` | yes | The server exits at startup if it can't connect. |
| `JWT_SECRET` | yes | Signs login tokens. Without it login returns 500. Generate one with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. |
| `CLIENT_URL` | yes | Web origin used to build the verify and reset links. |
| `SENDGRID_API_KEY`, `EMAIL_FROM` | server only | Leave both empty locally: emails are not sent, the link is printed to the console instead. |
| `PORT` | no | Defaults to `5050`. |
| `OVERPASS_URL` | no | Defaults to the public Overpass server (nearby search, no key). |

## Test it

```bash
npm test
```

Runs the unit and integration tests (`node:test`, in `tests/`). They need no MongoDB, SendGrid account or
internet: the models, `sgMail.send` and the Overpass client are stubbed.

### Trying it by hand

With the seed data loaded and `npm run dev` running (every seed password is `Password123!`):

| Try | Request | Expect |
|---|---|---|
| Log in | `POST /api/auth/login` `{ "email": "jane.doe@example.com", "password": "Password123!" }` | 200 `{ token, user }` |
| Unverified account | same, with `alex.kim@example.com` | 403 `"Email not verified"` |
| Verify it | `GET /api/auth/verify-email?token=demo-verify-token` | 200; `alexkim` can now log in |
| Reset a password | `POST /api/auth/reset-password` `{ "token": "demo-reset-token", "password": "NewPassword1" }` | 200; `chrisb` logs in with the new password |
| New account | `POST /api/auth/register`, then copy the token from the `[email] Verify your email ...` line in the server console into `verify-email` | 201, then 200 |
| Nearby | `POST /api/restaurants/nearby` with `Authorization: Bearer <token>` and `{ "lat": 28.6024, "lng": -81.2001 }` | 200 `{ restaurants }` within the user's saved radius |

The demo tokens are single use and expire relative to when `seed.js` ran: **`demo-reset-token` after 1 hour**,
`demo-verify-token` after 24 hours. Re-run `seed.js` shortly before a demo.

## What's built

| Endpoint | Issue | Status |
|---|---|---|
| `GET /health` | #10 | done |
| `POST /auth/register`, `POST /auth/login` | #12, #13 | done |
| `GET /auth/verify-email`, `POST /auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password` | #21 | done |
| `POST /restaurants/nearby` | #30 | done |
| `/users/me`, profile, goal, preferences, calories | #23, #24 | to do |
| `GET /menu-items/search` | #31 | to do |
| `POST /recommendations` | #32 | to do |
| `/favorites` | #33 | to do |

Update this table when you add an endpoint.

## Layout

```
src/
  app.js           routes mounted under /api, then the 404 and error handlers
  server.js        connects to MongoDB, then listens
  routes/          one router per group (auth, restaurants, ...)
  controllers/     request handling and input checks
  middleware/      auth.js (JWT -> req.userId), error.js (the only place that shapes errors)
  models/          User, Chain; mirror db/schema.js, which rejects any extra field
  services/        email, tokens (JWTs and emailed tokens), chainMatch
  integrations/    places.js (Overpass client)
  utils/           httpError, readBody, toUserJSON, normalize
tests/unit/, tests/integration/
```

## Adding an endpoint

The remaining endpoints (#23, #24, #31-#33) can follow the auth and nearby code:

- **Route:** add or extend a router in `src/routes` and mount it in `app.js` under `/api`.
- **Protected route:** put `requireAuth` (`src/middleware/auth.js`) before the handler; it sets `req.userId` or answers 401.
- **Body:** read it with `readBody(req.body, ["field", ...])`, which answers 400 `"Unknown field: x"` for anything else
  (contract §1). Check types yourself: a non-string must never reach a Mongo filter (`{ "$ne": null }`).
- **Errors:** `throw httpError(status, message)` inside `try`, and `next(err)` in the `catch`. Never
  `res.status(...).json({ error })` in a controller. Errors without a status become 500 `"Server error"`.
- **Users:** return `toUserJSON(user)`, never the document, so password and token hashes can't leak.
- **Models:** use the options in the contract's "Mongoose gotchas" table (`versionKey: false`, explicit `collection`).
- **Tests:** stub model methods with `mock.method(User, "findOne", ...)`; see `tests/integration/auth.test.js`.
  Protected routes get a token from `signJwt(userId)` in `src/services/tokens.js`.

## Behavior worth knowing

- **Tokens:**
  - Verify links last 24 hours and reset links 1 hour. Only the SHA-256 of each token is stored.
  - Each token is used and cleared in one atomic update, so a link works once.
  - Login tokens are JWTs that last 7 days.
- **Email failures (#65)** are logged and never change the reply:
  - Register has already saved the user, who can use resend-verification.
  - Resend and forgot-password must reply the same whether or not the email exists.
- **No account probing:**
  - Resend and forgot-password give the same message for unknown emails.
  - Login compares against a dummy hash when no account matches, so a wrong email takes as long as a wrong password.
- **Nearby:**
  - `lat`/`lng`/`radiusMiles` must be JSON numbers; strings are rejected, not converted, because they go into the Overpass query.
  - With no `radiusMiles`, it uses the user's `preferences.searchRadius`.
  - Places that match no chain come back with `chainId: null` (no nutrition data). Nothing about the location is stored.
- **Known limits:**
  - No rate limiting on login or forgot-password.
  - A JWT stays valid for its 7 days after a password reset.
  - bcrypt ignores password bytes past 72.
  - Short alternate names in `db/menu-data/chains.js` ("Panda", "Canes") also match unrelated places that start with them.
