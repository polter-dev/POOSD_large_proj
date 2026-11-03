# API Contract

Single source of truth for the backend, the web client (`web/src/api`), the Flutter client and the SwaggerHub spec.
Field names, enums and ranges match `backend/db/schema.js` (MongoDB `MenuMacroFitter`: `users`, `chains`, `menuItems`, `favorites`, `mealLogs`, `submissions`). If this file and `schema.js` disagree, `schema.js` wins and this file gets fixed.

## 1. Conventions

| Topic | Rule |
|---|---|
| Base path | `/api`. Dev: `http://localhost:5050/api`. Prod: `https://<domain>/api` (never an IP in clients). |
| Bodies | JSON request and response bodies. `Content-Type: application/json`. |
| Dates | ISO 8601 strings. `birthDate` is sent and returned as `YYYY-MM-DD`. |
| IDs | Mongo `_id` is returned as `id` (24-hex string). Inputs that take an id (`chainIds`, `:id`) must be 24-hex, else 400 (404 for `:id`). |
| Never returned | `passwordHash`, `verificationTokenHash`, `verificationTokenExpires`, `resetTokenHash`, `resetTokenExpires`, `userId` on favorites, `searchName`, `source`, `lastVerified`. |
| Auth | `Authorization: Bearer <JWT>`. Payload `{ sub: <userId> }`, 7-day expiry, signed with `JWT_SECRET` from `backend/.env`. |
| Success codes | 200 with a body, 201 on create, 204 (empty body) on delete. |
| Error shape | Every error, no exceptions: `{ "error": "<human readable message>" }`. |
| Error codes | 400 validation; 401 missing/invalid token or bad credentials; 403 email not verified, or `"Admin only"`; 404 not found; 409 duplicate or invalid state change; 413 payload too large; 429 rate limit; 502 upstream (Places, photo analysis) failed; 503 service unavailable (photo analysis not configured); 500 server (message is always `"Server error"`). |
| Case | Server lowercases `email` and `username` (and trims them) before storing or comparing. |
| Password | Minimum 8 characters. Stored as a bcrypt hash. |
| Enumeration | `resend-verification` and `forgot-password` always return 200 with the same message whether or not the account exists. |
| Unknown fields | Request fields not listed here are rejected with 400 (the collections have `additionalProperties: false`). |

### Validation (exactly `schema.js`)

| Field | Rule |
|---|---|
| `firstName`, `lastName` | string, 1-50 chars |
| `username` | after lowercasing: `^[a-z0-9_.]{3,30}$` |
| `email` | after lowercasing: `^[^@\s]+@[^@\s]+\.[^@\s]+$`, max 254 chars |
| `profile.heightIn` | number, 36-96 |
| `profile.weightLb` | number, 50-700 |
| `profile.birthDate` | `YYYY-MM-DD`; age 18-119 (whole years) |
| `profile.sex` | `"male"` \| `"female"` |
| `profile.activityLevel` | `"sedentary"` \| `"light"` \| `"moderate"` \| `"active"` \| `"very_active"` |
| `profile.goal` | `"lose"` \| `"maintain"` \| `"gain"` |
| `preferences.units` | `"imperial"` \| `"metric"` |
| `preferences.searchRadius` | `5` \| `10` \| `15` \| `20` (miles) |
| `preferences.recommendationMode` | `"protein"` \| `"carb"` |
| `preferences.mealCalorieLimit` | number 100-3000, or `null` |
| `favorite.placeId` | `^[A-Za-z0-9_-]{10,300}$` (the `placeId` from a nearby result, e.g. `osm-node-1234567890`) |
| `favorite.label` | string 1-50 chars, or `null`/omitted (stored as `null`) |

### M6 data model (for `backend/db/schema.js`, all `additionalProperties: false`)

| Collection / field | Rule |
|---|---|
| `users.role` | optional; `"user"` \| `"admin"`; missing = `"user"`. Never writable through the API. |
| `users.preferences.trackedNutrients` | optional array, 1-4 unique values from `"calories"`, `"protein"`, `"carbs"`, `"fat"`; missing = `["calories","protein"]` |
| **`mealLogs`** | `_id, userId (objectId), date (string ^\d{4}-\d{2}-\d{2}$), status ("planned"\|"eaten"), menuItemId (objectId\|null), name (string 1-150), chainName (string 1-100\|null), servings (number 0.25-10), calories (number 0-5000), proteinG/carbsG/fatG (number >= 0 \| null), source ("search"\|"plan"\|"photo"\|"custom"), createdAt (date)`; all required. Index `{ userId: 1, date: 1 }` (`user_date`). |
| **`submissions`** | `_id, userId, kind ("edit_item"\|"new_item"\|"new_chain"), targetId (objectId\|null), payload (object), before (object\|null), resultId (objectId\|null), status ("auto_applied"\|"pending"\|"approved"\|"rejected"\|"reverted"), flags (array of string), reviewedBy (objectId\|null), reviewNote (string 1-300\|null), createdAt, updatedAt`; all required. Indexes `{ status: 1, createdAt: -1 }` (`status_created`) and `{ userId: 1, createdAt: -1 }` (`user_created`). |
| `menuItems` (no change) | community rows use `source: "community"`, `isEstimate: true`, `lastVerified: null` |

`date` is the **user's local calendar day**, sent by the client. The server never converts time zones.

## 2. Shared objects

`User` (returned by login, `GET /users/me` and every `/users/me/*` update):
```
{ id, firstName, lastName, username, email, isVerified, role: "user" | "admin",
  profile: null | { heightIn, weightLb, birthDate, sex, activityLevel, goal },
  preferences: { units, searchRadius, recommendationMode, mealCalorieLimit, trackedNutrients: string[] } }
```
Height/weight are always imperial in the API; clients convert for display when `preferences.units === "metric"`. `role` and `preferences.trackedNutrients` are always present, filled with defaults when missing.

`MenuItem`:
```
{ id, chainId, chainName, name, category, calories, proteinG, carbsG, fatG, isEstimate }
```
`category` is one of `"entree"`, `"side"`, `"breakfast"`, `"salad"`, `"drink"`, `"dessert"`. `proteinG`/`carbsG`/`fatG` may be `null` = unknown (never treat as 0).

`RecommendedItem` = `MenuItem` + `score` (number, 1 decimal: ranking-macro grams per 100 kcal).

`Favorite`: `{ id, placeId, label, createdAt }` (`label` is string or `null`).

`Calories`: `{ age, maintenance, target, perMeal, macros: { proteinG, carbsG, fatG } }`, all integers (`macros` = daily targets in grams). Mifflin-St Jeor as `backend/db/queries.md` query 21, plus the #24 floor:

| Step | Formula |
|---|---|
| `age` | whole years from `birthDate` to today (minus 1 if this year's birthday hasn't happened) |
| kg, cm | `kg = weightLb * 0.453592`, `cm = heightIn * 2.54` |
| bmr (not returned) | `10*kg + 6.25*cm - 5*age + (sex === "male" ? 5 : -161)` |
| `maintenance` | `round(bmr * multiplier)`; sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very_active 1.9 |
| `target` | `maintenance` - 500 (lose) / + 0 (maintain) / + 300 (gain) |
| floor | `target = max(target, sex === "female" ? 1200 : 1500)` |
| `perMeal` | `preferences.mealCalorieLimit` if not null, else `round(target / 3)` (floored target) |
| `macros` | split of `target` kcal by goal, as % protein / carbs / fat: lose 35/35/30, maintain 30/40/30, gain 30/45/25. `proteinG = round(target * p / 4)`, `carbsG = round(target * c / 4)`, `fatG = round(target * f / 9)` |

Check: seed user `janedoe` gives maintenance 2058, target 1558, perMeal 519 (October 2026; shifts on birthdays).

Weekly goals are computed by the client: daily × 7.

`MealLog`:
```
{ id, date, status, menuItemId, name, chainName, servings, calories, proteinG, carbsG, fatG, source, createdAt }
```
`calories`/`proteinG`/`carbsG`/`fatG` are for **one serving**. Totals multiply by `servings`.

`Totals`: `{ calories, proteinG, carbsG, fatG, incomplete }`. Sums of `value * servings`. `calories` is an integer; macros have 1 decimal. A null macro adds nothing and sets `incomplete: true`, so the UI can show "at least".

`Submission`:
```
{ id, kind, targetId, payload, before, resultId, status, flags, reviewNote, createdAt, updatedAt }
```
Admin listings add `user: { id, username }` and `reviewedBy: { id, username } | null`.

`PhotoItem`: `{ menuItemId, name, chainName, servings, calories, proteinG, carbsG, fatG, confidence }`. `confidence` is `"high"` \| `"medium"` \| `"low"`. `menuItemId` is null for unmatched food.

## 3. Endpoints

### Auth

| Method | Path | Auth | Request body | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| POST | `/auth/register` | no | `{ firstName, lastName, username, email, password }` | 201 `{ message: "Verification email sent" }` | 400 invalid field (the design-spec sign-up message); 409 `"Email already registered"` or `"Username already taken"` | `register` |
| POST | `/auth/login` | no | `{ login, password }` (`login` = email or username) | 200 `{ token, user: User }` | 400 `"Email or username and password are required"`; 401 `"Invalid email/username or password"`; 403 `"Email not verified"` | `login` |
| GET | `/auth/verify-email?token=` | no | query: `token` required | 200 `{ message: "Email verified" }` | 400 `"Token is required"`; 400 `"Invalid or expired token"` | `verifyEmail` |
| POST | `/auth/resend-verification` | no | `{ login }` (email or username) | 200 `{ message: "If that account exists, a verification link was sent" }` | 400 `"Email or username is required"` | `resendVerification` |
| POST | `/auth/forgot-password` | no | `{ email }` | 200 `{ message: "If that email exists, a reset link was sent" }` | 400 `"Email is required"` | `forgotPassword` |
| POST | `/auth/reset-password` | no | `{ token, password }` | 200 `{ message: "Password updated" }` | 400 `"Token is required"`, `"Invalid or expired token"` or `"Password: at least 8 characters"` | `resetPassword` |

- **register** creates the user with `isVerified: false`, `profile: null`, default preferences `{ units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null }`, and emails `${CLIENT_URL}/verify-email?token=...`. That client page reads `token` and calls `GET /auth/verify-email?token=...`.
- **Tokens** (verify and reset): random token in the link; only its SHA-256 is stored (`verificationTokenHash` / `resetTokenHash`) with an expiry. Verification links expire in 24 hours, reset links in 1 hour. A used token is set to `null` (with its expiry).
- **resend-verification** does nothing (still 200) if the user is already verified.
- **forgot-password** emails `${CLIENT_URL}/reset-password?token=...`.
- **login** checks the password before `isVerified`, so 403 is only returned for correct credentials.
- **`login` field** (login and resend-verification): trimmed and lowercased; a value with `@` is looked up as an email, anything else as a username (usernames can't contain `@`). The older `{ email }` body is still accepted, so clients that send it keep working. Resend emails the account's address even when given a username.
- **Email send failures** (SendGrid down, bad key, `EMAIL_FROM` unset) are logged and never change the reply (#65). Register has already saved the user, who can use resend-verification; resend and forgot must reply the same whether or not the email exists.
- **Protected routes** answer 401 `"Not logged in"` with no `Bearer` token and 401 `"Invalid or expired session"` for a bad or expired one. A missing `JWT_SECRET` is a 500.

### Users (all auth yes)

| Method | Path | Auth | Request body | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| GET | `/users/me` | yes | none | 200 `User` | 401; 404 user deleted | `getMe` |
| PUT | `/users/me/profile` | yes | `{ heightIn, weightLb, birthDate, sex, activityLevel, goal }` (all required; replaces the profile) | 200 `User` | 400 any invalid field, under 18 or over 120 | `updateProfile` |
| PUT | `/users/me/goal` | yes | `{ goal }` | 200 `User` | 400 invalid goal; 400 `"Set your profile first"` if profile is null | `updateGoal` |
| PATCH | `/users/me/preferences` | yes | any subset of `{ units, searchRadius, recommendationMode, mealCalorieLimit, trackedNutrients }` (partial merge; `mealCalorieLimit: null` clears it) | 200 `User` | 400 invalid value or empty body; 400 `"trackedNutrients: pick 1-4 of calories, protein, carbs, fat"` (must be an array of 1-4 unique allowed values) | `updatePreferences` |
| GET | `/users/me/calories` | yes | none | 200 `Calories` (with `macros`) | 400 `"Set your profile first"` if profile is null | `getCalories` |

### Menu

| Method | Path | Auth | Request body / query | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| GET | `/menu-items/search?q=&limit=&skip=` | no | query: `q` required (1-100 chars); `limit` int default 20, max 100; `skip` int default 0 | 200 `{ items: MenuItem[], total, limit, skip }` | 400 missing/invalid `q`, `limit` or `skip` | `searchMenuItems` |
| POST | `/recommendations` | yes | all optional: `{ chainIds: string[], mode: "protein"\|"carb", mealCalorieLimit: number, limit: number, includeEstimates: boolean }` | 200 `{ mode, mealCalorieLimit, items: RecommendedItem[] }` | 400 invalid field; 400 `"Set your profile first"` if no limit can be resolved | `recommendations` |

**Search:**
1. Normalize `q` exactly like `normalize()` in `backend/db/seed.js`: strip accents, lowercase, `&` -> ` and `, drop apostrophes (`'` and `’`), every run of other non-`[a-z0-9]` chars -> one space, trim. If the result is empty, 400.
2. Regex-escape it; match as a partial (unanchored) case-insensitive regex against `menuItems.searchName` only.
3. Sort by `chainName` then `name`, ascending. `total` = `countDocuments` on `menuItems` with the same filter (before `limit`/`skip`). No calorie floor, no `isEstimate` filter.

**Recommendations:**

| Input | Default | Rule |
|---|---|---|
| `mode` | `preferences.recommendationMode` | `"protein"` ranks by `proteinG`, `"carb"` by `carbsG` |
| `mealCalorieLimit` | `Calories.perMeal` (= `preferences.mealCalorieLimit`, else `round(target/3)`) | number 100-3000. 400 only if body omits it, `preferences.mealCalorieLimit` is null and profile is null |
| `limit` | 10 | int 1-50 |
| `chainIds` | omitted = all chains | array of 24-hex ids; empty array = all chains |
| `includeEstimates` | `false` | boolean; when `false`, only items with `isEstimate: false` |

Returns items with `300 <= calories <= mealCalorieLimit` (300 kcal floor, so no tiny-portion winners and no divide by zero) and a non-null ranking macro. `score = round(macroG / calories * 100, 1)`; sorted by `score` descending, then `calories` ascending. Response echoes the resolved `mode` and `mealCalorieLimit`.

### Restaurants

| Method | Path | Auth | Request body | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| POST | `/restaurants/nearby` | yes | `{ lat, lng, radiusMiles? }`; `lat` -90..90, `lng` -180..180, `radiusMiles` `5`\|`10`\|`15`\|`20` (default `preferences.searchRadius`) | 200 `{ restaurants: [{ placeId, name, address: string\|null, distanceMiles, chainId: string\|null }] }` | 400 invalid coords/radius; 401; 404 `"User not found"` (radius omitted and the account was deleted); 502 `"Places lookup failed"` | `nearby` |

- `placeId` is `osm-<type>-<id>` for the OpenStreetMap element (`osm-node-123...`, `osm-way-...`). It has no `/`, so it can be saved as a favorite as-is.
- `chainId` is set when the normalized place name matches a chain's `nameKey` or `alternateNames` (exact lookup, then the prefix fallback in `backend/db/README.md` "For the API team"). `null` = no nutrition data.
- Nothing about the location or the user's coordinates is stored (spec N4).

### Favorites (all auth yes)

| Method | Path | Auth | Request body | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| GET | `/favorites` | yes | none | 200 `{ favorites: Favorite[] }` (newest first) | 401 | `getFavorites` |
| POST | `/favorites` | yes | `{ placeId, label? }` | 201 `Favorite` | 400 invalid; 409 already favorited (unique `userId`+`placeId`) | `addFavorite` |
| DELETE | `/favorites/:id` | yes | none | 204 | 404 not found, not owned by the caller, or malformed id | `removeFavorite` |

### Meal logs (all auth yes)

| Method | Path | Auth | Request body / query | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| GET | `/meal-logs?from=&to=` | yes | both `YYYY-MM-DD`, real dates, `from <= to`, at most 31 days inclusive | 200 `{ entries: MealLog[], days: [{ date, eaten: Totals, planned: Totals }] }` | 400 `"from and to must be dates (YYYY-MM-DD), at most 31 days apart"` | TBD |
| POST | `/meal-logs` | yes | `{ entries: Entry[] }`, 1-50 | 201 `{ entries: MealLog[] }` | 400 (first invalid entry: `"entries[i]: <message>"`); 404 `"entries[i]: menu item not found"` | TBD |
| PATCH | `/meal-logs/:id` | yes | any subset (at least one) of `{ status, servings }` | 200 `MealLog` | 400 invalid or empty; 404 not found / not yours / malformed id | TBD |
| DELETE | `/meal-logs/:id` | yes | none | 204 | 404 not found / not yours / malformed id | TBD |

`Entry` fields:
- `date` (required)
- `status` (default `"eaten"`)
- `servings` (default 1)
- `source` (required): `"search"`, `"plan"`, `"photo"` or `"custom"`
- **either** `menuItemId`: the server copies `name`, `chainName` and the macros from the menu item. Sending any of `name`, `chainName`, `calories`, `proteinG`, `carbsG`, `fatG` alongside it is a 400.
- **or** no `menuItemId`: `name`, `calories`, `proteinG`, `carbsG` and `fatG` are required (macros may be null). `chainName` is optional (null).

The whole batch is validated before anything is written: all entries or none.

GET details:
- `entries` are sorted by `date`, then `createdAt`.
- `days` has one row per date in the range, empty days included, with zero totals and `incomplete: false`.

### Meal plans (all auth yes)

| Method | Path | Auth | Query | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| GET | `/meal-plans` | yes | `start` (`YYYY-MM-DD`, required); `days` `1`\|`7` (default 1); `chainIds` comma-separated 24-hex (optional, empty = all); `mode` `protein`\|`carb` (default preference) | 200 `{ mode, days: [{ date, remainingCalories, mealCalorieLimit, items: RecommendedItem[], totals: Totals }] }` | 400 invalid query; 400 `"Set your profile first"` | TBD |

Nothing is stored. For each day:
1. `remainingCalories` = `Calories.target` minus that day's logged calories × servings, planned and eaten together. Floor at 0.
2. `slots` = 3 if the day has no entries, otherwise `max(1, 3 - entryCount)`.
3. `mealCalorieLimit` = `min(perMeal, floor(remainingCalories / slots))`.
4. Fill each slot with the best `rankItems` result (existing `services/recommendations.js`, verified items only) under that limit. Skip items already used anywhere in this plan. Prefer a chain not yet used that day; fall back to the top item.
5. If `mealCalorieLimit < 300`, `items` is empty.

`totals` is the sum of the picked items, one serving each.

Opting in is done by the client: it sends the picked items to `POST /meal-logs` with `status: "planned"`, `source: "plan"`, `menuItemId`. "Ate it" is `PATCH /meal-logs/:id { status: "eaten" }`.

### Photo analysis

| Method | Path | Auth | Request body | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| POST | `/photo-analyses` | yes | `{ imageBase64, mediaType }`. `mediaType` is `image/jpeg`, `image/png` or `image/webp`; base64 without a `data:` prefix, at most 3,000,000 chars. | 200 `{ items: PhotoItem[] }` (0-10 items; `[]` = no food recognized) | 400 invalid body; 413 `"Image too large"`; 429 `"Daily photo limit reached"` (20 per user per UTC day); 502 `"Photo analysis failed"`; 503 `"Photo analysis unavailable"` (no API key configured) | TBD |

- Nothing is saved, and the image is never stored or logged.
- A returned `menuItemId` always exists in `menuItems`, and its name, chain and macros are the database values, not the model's.
- Clients show the items on a confirm/edit screen, then call `POST /meal-logs` with `source: "photo"`.

### Community submissions (all auth yes)

| Method | Path | Auth | Request body | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| POST | `/submissions` | yes | `{ kind, targetId, payload }` | 201 `Submission` (status `auto_applied` or `pending`) | 400 invalid; 404 target not found; 409 `"Item already exists"` / `"Restaurant already exists"`; 429 `"Too many submissions today"` (10 per rolling 24 h) | TBD |
| GET | `/submissions/mine` | yes | none | 200 `{ submissions: Submission[] }`, newest first, max 50 | 401 | TBD |

Payload by `kind`:

| kind | targetId | payload |
|---|---|---|
| `edit_item` | menu item id | non-empty subset of `{ name, category, calories, proteinG, carbsG, fatG }` (same rules as `menuItems`) |
| `new_item` | chain id | `{ name, category, calories, proteinG, carbsG, fatG }`, all required (macros may be null) |
| `new_chain` | `null` | `{ name (1-100), nutritionSourceUrl (^https://), alternateNames? (0-10 strings, 1-100 chars each) }` |

Duplicate checks use `normalize()`:
- `new_item`: 409 if the chain already has the same `searchName`.
- `new_chain`: 409 if the name matches an existing `nameKey` or `alternateNames`.

**Auto-moderation.** Any flag means `pending`. No flags means `auto_applied`, and the change is written immediately. Flags:

| Flag | When |
|---|---|
| `new_chain` | always for `new_chain` |
| `verified_item` | `edit_item` target has `isEstimate: false` |
| `renamed` | `edit_item` changes `name` |
| `large_change` | `edit_item` moves any number by more than 30% of its current value (current 0 and new value not 0 counts as large) |
| `macros_mismatch` | after merging with current values, calories and all three macros are known and `abs(4P + 4C + 9F - calories) > max(0.2 * calories, 40)` |
| `new_account` | user created less than 24 h ago |
| `untrusted_user` | user has 2 or more `rejected` submissions |
| `url_in_name` | `name` contains `http`, `www.` or `.com` |

**What applying does:**
- `edit_item`: sets the fields, recomputes `searchName`, and sets `isEstimate: true`, `source: "community"`, `lastVerified: null`. `before` stores the previous values of every field it changed.
- `new_item`: inserts the item with `chainName` copied from the chain and community values, and sets `resultId`.
- `new_chain`: inserts the chain with normalized `nameKey`/`alternateNames`, and sets `resultId`.

### Admin (all auth yes, and `role: "admin"`, else 403 `"Admin only"`)

| Method | Path | Auth | Request body / query | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| GET | `/admin/submissions` | admin | `status` (default `pending`), `limit` (default 20, max 100), `skip` | 200 `{ submissions: Submission[] (with user, reviewedBy), total }`, oldest first for `pending`, newest first otherwise | 400 bad query; 403 | TBD |
| PATCH | `/admin/submissions/:id` | admin | `{ status, reviewNote? }` | 200 `Submission` | 400; 403; 404; 409 `"Can't change a <from> submission to <to>"` | TBD |

Allowed status changes:
- `pending` → `approved` (applies the change)
- `pending` → `rejected`
- `auto_applied` or `approved` → `reverted`: an edit restores `before`; a new item is deleted; a new chain is deleted only if it has no menu items, else 409 `"Restaurant has menu items"`.

`reviewedBy` is set to the admin on every change.

Admins are granted only on the server: `node scripts/make-admin.js <username>` (and `--revoke`). Same login as everyone else; no separate admin login.

### Ops

| Method | Path | Auth | Request body | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| GET | `/health` | no | none | 200 `{ ok: true, db: true\|false }` (`db` = mongoose connected) | none | none (Refs #10, #19) |

## 4. Backend conventions (for anyone implementing an endpoint)

| Topic | Rule |
|---|---|
| Layout | Keep the README layout: `backend/src/{routes,controllers,middleware,models,services,integrations,config,utils}`. |
| Stack | CommonJS JavaScript (README's `npm init` toolchain), Express, Mongoose. Tests use built-in `node:test` (no Jest), in `backend/tests/{unit,integration}`. |
| Routing | One router file per group under `src/routes` (`auth`, `users`, `menuItems`, `recommendations`, `restaurants`, `favorites`, `health`), each mounted in `src/app.js` under `/api`. |
| Errors | All errors go through the single error middleware: `next(err)` with `err.status` and `err.message`. Never ad-hoc `res.status(...).json({ error })` in controllers. Errors without a status become 500 `"Server error"`. Mongo duplicate key (`code 11000`) becomes 409. |
| Auth middleware | `src/middleware/auth.js` verifies the JWT and sets `req.userId`; on failure `next` a 401. |
| Logic | Calorie formula and recommendation ranking live in `src/services` and get unit tests. Places client lives in `src/integrations`. |

**Mongoose gotchas.** The collections already have strict `$jsonSchema` validators with `additionalProperties: false`; any extra field makes the write fail.

| Model | Options |
|---|---|
| `User` | `{ collection: "users", versionKey: false, timestamps: true }` |
| `Chain` | `{ collection: "chains", versionKey: false, timestamps: true }` |
| `MenuItem` | `{ collection: "menuItems", versionKey: false, timestamps: false }` (the validator has no `createdAt`/`updatedAt`) |
| `Favorite` | `{ collection: "favorites", versionKey: false, timestamps: { createdAt: true, updatedAt: false } }` |
| `MealLog` | `{ collection: "mealLogs", versionKey: false, timestamps: { createdAt: true, updatedAt: false } }` |
| `Submission` | `{ collection: "submissions", versionKey: false, timestamps: true }` |

- Always pass `collection` so Mongoose does not re-pluralize (`menuItems`, not `menuitems`). `versionKey: false` so `__v` is never written.
- Never add fields the validator does not list. Nested `profile` and `preferences` must be declared with `_id: false`.
- Store `email`/`username` lowercased; store `birthDate` as a `Date` (UTC midnight of the given `YYYY-MM-DD`), return it as `YYYY-MM-DD`.
