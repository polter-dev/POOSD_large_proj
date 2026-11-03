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
| `ANTHROPIC_API_KEY` | server only | Key for `POST /photo-analyses` (Claude). Leave empty locally: that endpoint answers 503. |
| `PHOTO_MODEL` | no | Claude model for photo analysis. Defaults to `claude-haiku-5-5`. |
| `PORT` | no | Defaults to `5050`. |
| `OVERPASS_URL` | no | First Overpass server tried for nearby search (no key). After it, the public servers in `places.js` are tried in order (overpass-api.de, overpass.openstreetmap.fr, overpass.kumi.systems), at most 3 attempts. Results are cached in memory for 10 minutes. If every attempt fails, see [Nearby fallback snapshot](#nearby-fallback-snapshot). |

## Test it

```bash
npm test
```

Runs the unit and integration tests (`node:test`, in `tests/`). They need no MongoDB, SendGrid account or
internet: the models, `sgMail.send`, the Overpass client and the Claude SDK are stubbed.

`tests/db/` runs the API end to end against a real MongoDB loaded with `db/schema.js` and `db/seed.js`, so every
write must also pass the collection validators. It writes data (and puts it back), so it is skipped unless
`TEST_MONGODB_URI` is set. Never point it at the production database. CI runs it on every backend PR.

```bash
SEED_ADMIN=1 mongosh "mongodb://localhost:27017" db/schema.js db/seed.js   # SEED_ADMIN adds siteadmin for the admin tests
TEST_MONGODB_URI=mongodb://localhost:27017 npm run test:db
```

Saved results for the slides are in [`docs/test-results/`](../docs/test-results/). A Postman collection covering
every endpoint is in [`docs/postman/`](../docs/postman/).

### Trying it by hand

With the seed data loaded and `npm run dev` running (every seed password is `Password123!`):

| Try | Request | Expect |
|---|---|---|
| Log in | `POST /api/auth/login` `{ "login": "jane.doe@example.com", "password": "Password123!" }` | 200 `{ token, user }` |
| Log in by username | same, with `"login": "janedoe"` | 200 `{ token, user }` |
| Unverified account | same, with `alex.kim@example.com` | 403 `"Email not verified"` |
| Verify it | `GET /api/auth/verify-email?token=demo-verify-token` | 200; `alexkim` can now log in |
| Reset a password | `POST /api/auth/reset-password` `{ "token": "demo-reset-token", "password": "NewPassword1" }` | 200; `chrisb` logs in with the new password |
| New account | `POST /api/auth/register`, then copy the token from the `[email] Verify your email ...` line in the server console into `verify-email` | 201, then 200 |
| Nearby | `POST /api/restaurants/nearby` with `Authorization: Bearer <token>` and `{ "lat": 28.6024, "lng": -81.2001 }` | 200 `{ restaurants }` within the user's saved radius |
| Calories | `GET /api/users/me/calories` as `janedoe` | 200 `{ age: 20, maintenance: 2058, target: 1558, perMeal: 519, macros: { proteinG: 136, carbsG: 136, fatG: 52 } }` (October 2026) |
| Search | `GET /api/menu-items/search?q=grilled nuggets` (no login) | 200 `{ items, total, limit, skip }` |
| Recommendations | `POST /api/recommendations` `{}` as `janedoe` | 200, carb mode, items 300-519 kcal, best `score` first |

The demo tokens are single use and expire relative to when `seed.js` ran: **`demo-reset-token` after 1 hour**,
`demo-verify-token` after 24 hours. Re-run `seed.js` shortly before a demo.

## What's built

| Endpoint | Issue | Status |
|---|---|---|
| `GET /health` | #10 | done |
| `POST /auth/register`, `POST /auth/login` | #12, #13 | done |
| `GET /auth/verify-email`, `POST /auth/resend-verification`, `/auth/forgot-password`, `/auth/reset-password` | #21 | done |
| `POST /restaurants/nearby` (with the stale-cache and snapshot fallback) | #30, #128 | done |
| `/users/me`, profile, goal, preferences, calories | #23, #24 | done |
| `GET /menu-items/search` | #31 | done |
| `POST /recommendations` | #32 | done |
| `/favorites` | #33 | done |
| `/meal-logs` (GET, POST, PATCH, DELETE); `macros` in calories; `trackedNutrients` preference | #108 | done |
| `POST /submissions`, `GET /submissions/mine` | #110 | done |
| `GET /admin/submissions`, `PATCH /admin/submissions/:id` | #109 | done |

Update this table when you add an endpoint.

## Nearby fallback snapshot

`POST /restaurants/nearby` always asks Overpass first. When every attempt fails (#128), it answers from the last
cached result for the same search, even if it's past its 10 minutes, and otherwise from `db/places-snapshot.json`:
the OpenStreetMap places of the seeded chains within 20 miles of UCF, captured with the API's own query. The
snapshot is filtered by the request's radius and chain names exactly like a live answer and returned in the same
shape (no "source" field), so clients can't tell the difference. Each fallback logs one `[places] ...` line, which
`pm2 logs api` shows. Far from UCF (nothing within the radius, and more than 20 miles away) it is still 502
`"Places lookup failed"`. Fallback answers are never cached, so the next request tries Overpass again.

Re-capture it after adding a chain to `db/menu-data/chains.js`, or to refresh it, then commit the file:

```bash
node scripts/capture-places-snapshot.js
```

It needs internet but no database: it reads the chain names from `chains.js`, tries `OVERPASS_URL` and then the
public servers with a 2-minute timeout (a 20-mile query takes about 30 s on a busy server), and leaves the file
alone if none answers. `tests/unit/placesSnapshot.test.js` fails when a seeded chain has no places in the snapshot.
The data is OpenStreetMap's (ODbL), so the file keeps its attribution line.

## Layout

```
src/
  app.js           routes mounted under /api, then the 404 and error handlers
  server.js        connects to MongoDB, then listens
  routes/          one router per group (auth, restaurants, ...)
  controllers/     request handling and input checks
  middleware/      auth.js (JWT -> req.userId), error.js (the only place that shapes errors)
  models/          User, Chain, MenuItem, Favorite; mirror db/schema.js, which rejects any extra field
  services/        email, tokens (JWTs and emailed tokens), chainMatch, calories, recommendations
  integrations/    places.js (Overpass client, stale-cache and snapshot fallback)
  utils/           httpError, readBody, toUserJSON, toMenuItemJSON, normalize
scripts/           make-admin.js, capture-places-snapshot.js
tests/unit/, tests/integration/, tests/db/ (real MongoDB)
```

## Adding an endpoint

Follow the existing routes and controllers:

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
  - Resend and forgot-password give the same message for unknown accounts.
  - Login compares against a dummy hash when no account matches, so a wrong email or username takes as long as a wrong password.
- **Login by email or username:** `login` and resend-verification take `{ login }`; a value with `@` is an email,
  anything else a username. `{ email }` still works, so the mobile app keeps logging in until it switches.
- **Nearby:**
  - `lat`/`lng`/`radiusMiles` must be JSON numbers; strings are rejected, not converted, because they go into the Overpass query.
  - With no `radiusMiles`, it uses the user's `preferences.searchRadius`.
  - Places that match no chain come back with `chainId: null` (no nutrition data). Nothing about the location is stored.
  - `placeId` is `osm-node-123...` (no `/`), so a result can be saved as a favorite unchanged.
  - Every Overpass server failing falls back to a stale cached result, then the snapshot (see "Nearby fallback snapshot").
- **Users:** profile values must be JSON numbers and strings of the right type (`"65"` is rejected). `PUT /me/profile`
  replaces the whole profile; `PUT /me/goal` needs a profile first. Age must be 18-119 on the server's UTC date.
- **Search:** `q` is normalized like the stored `searchName` (lowercase, `&` -> `and`, punctuation -> space), so
  `CHICK-FIL-A nuggets` and `chick fil a nuggets` match the same items. Not logged in is fine.
- **Recommendations:** 300 kcal floor (no tiny sides on top), unknown macros never ranked, estimates hidden unless
  `includeEstimates: true`. With no body values it uses the saved mode and `perMeal`.
- **Favorites:** someone else's favorite id answers 404, the same as a missing one.
- **Meal logs:** `date` is the client's local day, never converted. A log is a snapshot: with `menuItemId` the server
  copies the item's name, chain and macros (sending them too is a 400), and later edits to the item don't change it.
  A POST batch is checked in full (400s, then 404 for a missing menu item) before `insertMany`, so it saves all or
  nothing. Someone else's entry answers 404, like favorites. Totals (`services/totals.js`, shared with meal plans)
  multiply by `servings`; a null macro adds nothing and sets `incomplete`.
- **Admin:** `requireAdmin` reads `role` from the database on every request, so `make-admin.js --revoke` is instant.
  Approve/revert live in `services/moderation.js`; a revert only matches while the item still holds the submission's
  values, so a later edit is never overwritten. Reverting an edit is also 409 `"Item changed since this submission"`
  while a later applied edit of the same item exists, even of other fields: `before` restores `isEstimate`/`source`/
  `lastVerified` too, which would label that edit's values verified. Each review replaces `reviewNote` (omitted or blank = `null`).
- **Submissions:** `validatePayload` and `flagsFor` in `services/moderation.js` are pure; with no flags the
  controller calls the same `apply()` as the admin approve, so `before`/`resultId` and the 409 on a unique-index clash
  match. The 10-per-24-hours limit counts the `submissions` collection (rolling window, any status), so it survives deploys.
- **Known limits:**
  - No rate limiting on login or forgot-password.
  - A JWT stays valid for its 7 days after a password reset.
  - bcrypt ignores password bytes past 72.
  - Nearby's fallback starts only after all 3 Overpass attempts fail. When the servers time out instead of refusing,
    that is up to about 45 s (3 x 15 s) before the stale or snapshot answer. The snapshot covers only the seeded chains
    within 20 miles of UCF, as of its capture date.
