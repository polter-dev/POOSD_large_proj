# API Contract

Single source of truth for the backend, the web client (`web/src/api`), the Flutter client and the SwaggerHub spec.
Field names, enums and ranges match `backend/db/schema.js` (MongoDB `MenuMacroFitter`: `users`, `chains`, `menuItems`, `favorites`). If this file and `schema.js` disagree, `schema.js` wins and this file gets fixed.

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
| Error codes | 400 validation; 401 missing/invalid token or bad credentials; 403 email not verified; 404 not found; 409 duplicate; 502 upstream (Places) failed; 500 server (message is always `"Server error"`). |
| Case | Server lowercases `email` and `username` (and trims them) before storing or comparing. |
| Password | Minimum 8 characters. Stored as a bcrypt hash. |
| Enumeration | `resend-verification` and `forgot-password` always return 200 with the same message whether or not the email exists. |
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

## 2. Shared objects

`User` (returned by login, `GET /users/me` and every `/users/me/*` update):
```
{ id, firstName, lastName, username, email, isVerified,
  profile: null | { heightIn, weightLb, birthDate, sex, activityLevel, goal },
  preferences: { units, searchRadius, recommendationMode, mealCalorieLimit } }
```
Height/weight are always imperial in the API; clients convert for display when `preferences.units === "metric"`.

`MenuItem`:
```
{ id, chainId, chainName, name, category, calories, proteinG, carbsG, fatG, isEstimate }
```
`category` is one of `"entree"`, `"side"`, `"breakfast"`, `"salad"`, `"drink"`, `"dessert"`. `proteinG`/`carbsG`/`fatG` may be `null` = unknown (never treat as 0).

`RecommendedItem` = `MenuItem` + `score` (number, 1 decimal: ranking-macro grams per 100 kcal).

`Favorite`: `{ id, placeId, label, createdAt }` (`label` is string or `null`).

`Calories`: `{ age, maintenance, target, perMeal }`, all integers. Mifflin-St Jeor as `backend/db/queries.md` query 21, plus the #24 floor:

| Step | Formula |
|---|---|
| `age` | whole years from `birthDate` to today (minus 1 if this year's birthday hasn't happened) |
| kg, cm | `kg = weightLb * 0.453592`, `cm = heightIn * 2.54` |
| bmr (not returned) | `10*kg + 6.25*cm - 5*age + (sex === "male" ? 5 : -161)` |
| `maintenance` | `round(bmr * multiplier)`; sedentary 1.2, light 1.375, moderate 1.55, active 1.725, very_active 1.9 |
| `target` | `maintenance` - 500 (lose) / + 0 (maintain) / + 300 (gain) |
| floor | `target = max(target, sex === "female" ? 1200 : 1500)` |
| `perMeal` | `preferences.mealCalorieLimit` if not null, else `round(target / 3)` (floored target) |

Check: seed user `janedoe` gives maintenance 2058, target 1558, perMeal 519 (October 2026; shifts on birthdays).

## 3. Endpoints

### Auth

| Method | Path | Auth | Request body | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| POST | `/auth/register` | no | `{ firstName, lastName, username, email, password }` | 201 `{ message: "Verification email sent" }` | 400 invalid field (the design-spec sign-up message); 409 `"Email already registered"` or `"Username already taken"` | `register` |
| POST | `/auth/login` | no | `{ email, password }` | 200 `{ token, user: User }` | 400 `"Email and password are required"`; 401 `"Invalid email or password"`; 403 `"Email not verified"` | `login` |
| GET | `/auth/verify-email?token=` | no | query: `token` required | 200 `{ message: "Email verified" }` | 400 `"Token is required"`; 400 `"Invalid or expired token"` | `verifyEmail` |
| POST | `/auth/resend-verification` | no | `{ email }` | 200 `{ message: "If that email exists, a verification link was sent" }` | 400 `"Email is required"` | `resendVerification` |
| POST | `/auth/forgot-password` | no | `{ email }` | 200 `{ message: "If that email exists, a reset link was sent" }` | 400 `"Email is required"` | `forgotPassword` |
| POST | `/auth/reset-password` | no | `{ token, password }` | 200 `{ message: "Password updated" }` | 400 `"Token is required"`, `"Invalid or expired token"` or `"Password: at least 8 characters"` | `resetPassword` |

- **register** creates the user with `isVerified: false`, `profile: null`, default preferences `{ units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null }`, and emails `${CLIENT_URL}/verify-email?token=...`. That client page reads `token` and calls `GET /auth/verify-email?token=...`.
- **Tokens** (verify and reset): random token in the link; only its SHA-256 is stored (`verificationTokenHash` / `resetTokenHash`) with an expiry. Verification links expire in 24 hours, reset links in 1 hour. A used token is set to `null` (with its expiry).
- **resend-verification** does nothing (still 200) if the user is already verified.
- **forgot-password** emails `${CLIENT_URL}/reset-password?token=...`.
- **login** checks the password before `isVerified`, so 403 is only returned for correct credentials.
- **Email send failures** (SendGrid down, bad key, `EMAIL_FROM` unset) are logged and never change the reply (#65). Register has already saved the user, who can use resend-verification; resend and forgot must reply the same whether or not the email exists.
- **Protected routes** answer 401 `"Not logged in"` with no `Bearer` token and 401 `"Invalid or expired session"` for a bad or expired one. A missing `JWT_SECRET` is a 500.

### Users (all auth yes)

| Method | Path | Auth | Request body | Success | Errors | Web client fn |
|---|---|---|---|---|---|---|
| GET | `/users/me` | yes | none | 200 `User` | 401; 404 user deleted | `getMe` |
| PUT | `/users/me/profile` | yes | `{ heightIn, weightLb, birthDate, sex, activityLevel, goal }` (all required; replaces the profile) | 200 `User` | 400 any invalid field, under 18 or over 120 | `updateProfile` |
| PUT | `/users/me/goal` | yes | `{ goal }` | 200 `User` | 400 invalid goal; 400 `"Set your profile first"` if profile is null | `updateGoal` |
| PATCH | `/users/me/preferences` | yes | any subset of `{ units, searchRadius, recommendationMode, mealCalorieLimit }` (partial merge; `mealCalorieLimit: null` clears it) | 200 `User` | 400 invalid value or empty body | `updatePreferences` |
| GET | `/users/me/calories` | yes | none | 200 `Calories` | 400 `"Set your profile first"` if profile is null | `getCalories` |

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

- Always pass `collection` so Mongoose does not re-pluralize (`menuItems`, not `menuitems`). `versionKey: false` so `__v` is never written.
- Never add fields the validator does not list. Nested `profile` and `preferences` must be declared with `_id: false`.
- Store `email`/`username` lowercased; store `birthDate` as a `Date` (UTC midnight of the given `YYYY-MM-DD`), return it as `YYYY-MM-DD`.
