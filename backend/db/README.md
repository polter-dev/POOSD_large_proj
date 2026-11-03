# Database (MongoDB)

Database name: **`MenuMacroFitter`** (MongoDB 5.0+)

| File | What it does | Small-project equivalent |
|---|---|---|
| `schema.js` | Creates the 6 collections with validation rules and indexes | `sql/schema.sql` |
| `seed.js` | Deletes everything, then inserts test users, chains, menu items, favorites, meal logs, submissions | `sql/database/seed.sql` |
| `menu-data/chains.js` | Restaurant chains + menu items (edit this to add or verify food) | — |
| `places-snapshot.json` | Nearby's fallback when every Overpass server is down: OpenStreetMap places of the seeded chains within 20 miles of UCF. Not loaded into MongoDB; the API reads the file (#128) | — |
| `queries.md` | Demo queries for the GTA, with expected results | `sql/database/queries.md` |
| `../scripts/make-admin.js` | Grants or revokes the admin role (the only way to make an admin) | — |
| `../scripts/capture-places-snapshot.js` | Re-captures `places-snapshot.json`; run it after adding a chain (backend README, "Nearby fallback snapshot") | — |

## Running it (PuTTY → server)

1. SSH into the server with PuTTY and `cd` into this folder:
   `cd ~/POOSD_large_proj/backend/db`
2. Create the collections and load the test data (safe to re-run any time):
   ```bash
   mongosh "<connection string>" schema.js seed.js
   ```
   - MongoDB on the same server: the connection string is `mongodb://localhost:27017`
     (add `user:password@` if auth is on).
   - MongoDB Atlas: use the `mongodb+srv://...` string from Atlas → Connect → Shell.
   - Always run both files together. On a database from before #29,
     `schema.js` drops the old `restaurants` and `menuItems` collections, and
     `seed.js` refills them as `chains` and `menuItems`.
3. Open the shell and run the queries in `queries.md`:
   ```bash
   mongosh "<connection string>"
   ```

Every test account's password is **`Password123!`**; see the top of `seed.js`
for each username and which state it's in (verified, unverified, profile null,
reset pending). Meal-log dates are relative to the day `seed.js` runs, so
re-run it on the morning of a demo.

### Admins (M6)

- **Locally or in CI** there's a seed admin, but only when you ask for it:
  ```bash
  SEED_ADMIN=1 mongosh "<connection string>" schema.js seed.js
  ```
  It's `siteadmin` / `admin@example.com`, password `Password123!`.
- **Never on production.** This repo is public, so a seeded admin there would
  let anyone approve, reject or revert community edits. Make a teammate's own
  account the admin instead, from `backend/` on the server:
  ```bash
  node scripts/make-admin.js <username>            # role: "admin"
  node scripts/make-admin.js <username> --revoke   # back to a normal user
  ```
  It reads `MONGODB_URI` from `backend/.env` and exits with an error if the
  username doesn't exist. There's no API route for it.

## Collections

**`users`**: one per account.
`firstName, lastName, username (unique), email (unique), passwordHash, isVerified,
verificationTokenHash/Expires, resetTokenHash/Expires, role?, profile, preferences,
createdAt, updatedAt`.
- `role` (M6) = `"user"` or `"admin"`, optional: missing means `"user"`. Only
  `scripts/make-admin.js` sets it.
- `profile` = `{ heightIn, weightLb, birthDate, sex, activityLevel, goal }`, or
  `null` until the user fills it in. Users must be 18–120 years old.
- `preferences` = `{ units, searchRadius, recommendationMode, mealCalorieLimit, trackedNutrients? }`,
  set to defaults at registration (`imperial`, `5`, `protein`, `null`).
  `trackedNutrients` (M6) is 1–4 of `calories`, `protein`, `carbs`, `fat`,
  optional: missing means `["calories", "protein"]`.
- `role` and `trackedNutrients` aren't in `required`, so accounts created
  before M6 still pass the validator and can still be updated.

**`chains`**: one per restaurant brand (not per location).
`name, nameKey (unique), alternateNames, nutritionSourceUrl, createdAt, updatedAt`.

**`menuItems`**: `chainId → chains._id, chainName, name, searchName, category,
calories, proteinG, carbsG, fatG, isEstimate, source, lastVerified`.
Unique on (chainId, searchName).

**`favorites`**: `userId → users._id, placeId, label, createdAt`.
Unique on (userId, placeId).

**`mealLogs`** (M6): one food a user ate or plans to eat on a day.
`userId → users._id, date, status, menuItemId → menuItems._id | null, name,
chainName, servings, calories, proteinG, carbsG, fatG, source, createdAt`.
Index (userId, date).
- `date` is `YYYY-MM-DD` in the **user's** time zone, sent by the client. The
  database only checks the format, so the API checks it's a real date.
- `status` is `planned` or `eaten`; `source` is `search`, `plan`, `photo` or `custom`.
- The macros are for **one serving**: totals multiply by `servings` (0.25–10).
  Unknown macros are `null`, never 0, so a day's totals can be "at least".
- It's a **snapshot**: name, chain and macros are copied from the menu item
  when the entry is made. Later edits to the item don't change past logs, and
  `menuItemId` can point at an item that has since been deleted.

**`submissions`** (M6): a community edit waiting for, or past, moderation.
`userId → users._id, kind, targetId, payload, before, resultId, status, flags,
reviewedBy → users._id | null, reviewNote, createdAt, updatedAt`.
Indexes (status, createdAt) and (userId, createdAt).
- `kind` is `edit_item` (targetId = a menu item), `new_item` (targetId = a
  chain) or `new_chain` (targetId = null; the database enforces this pairing).
- `status` is `auto_applied`, `pending`, `approved`, `rejected` or `reverted`.
- `flags` lists why it needs review (`verified_item`, `large_change`, ...);
  an empty list is what let it apply on its own.
- `payload` is the change. Its fields depend on `kind`, so the API checks them.
  `before` keeps what an applied edit replaced, so it can be reverted.
  `resultId` is the menu item or chain a `new_item`/`new_chain` created.
- Community menu items go into `menuItems` with `source: "community"` and
  `isEstimate: true`, so recommendations hide them (R4) until verified.

```
users 1 ──── * favorites          chains 1 ──── * menuItems
users 1 ──── * mealLogs * ──── 0..1 menuItems   (snapshot; the item may be gone)
users 1 ──── * submissions ──── 0..1 menuItems or chains (target / result)
users 1 ──── * submissions it reviewed (reviewedBy)
```

The ERD is `docs/diagrams/erd.puml`.

## For the API team

- **Normalizing names.** `chains.nameKey`, `chains.alternateNames` and
  `menuItems.searchName` are stored normalized: lowercase, accents removed,
  `&` → `and`, apostrophes dropped, every other run of non-letters/digits →
  one space, trimmed (`normalize()` in `seed.js`). Normalize the same way
  before looking anything up, then escape regex characters for search.
- **Nearby search (#30).** Normalize each Places result name `k`, then
  `chains.findOne({ $or: [{ nameKey: k }, { alternateNames: k }] })` (query 13).
  `null` means no nutrition data for that place. Store nothing about the location.
  - Places sometimes adds the location to the name ("Panda Express - UCF
    Student Union" → `panda express ucf student union`), which the exact
    lookup misses. When it returns `null`, fall back to a prefix match: load
    all chains once (there are only 10–20), and accept a chain if the
    normalized place name equals, or starts with followed by a space, its
    `nameKey` or one of its `alternateNames`. Prefer the longest match, so
    `subway` never wins over a longer name that also matches.
  - Only add an alternate spelling to `menu-data/chains.js` when it's a
    genuinely different name (e.g. `chickfila`), not to cover a location suffix.
    Never add a short word other restaurants start with (`panda`, `canes`):
    the prefix rule would tag "Panda Garden" as Panda Express.
- **Menu search (#31).** `menuItems.find({ searchName: { $regex: <escaped> } })`
  with `limit`/`skip` (query 12).
- **Recommendations (#32).** Filter `isEstimate: false` unless the user turned
  estimates on (R4), skip items whose ranked macro is `null`, score = grams per
  100 kcal (queries 15–17).
  - Add a minimum-calorie floor (suggested: `calories >= 300`). Grams per
    100 kcal favors small portions: without a floor, a 70-calorie fruit cup
    tops the carb list and Chipotle's plain "Chicken (4 oz)" outranks its full
    burrito bowl for protein (queries 16–17). One floor fixes both and
    answers the open question in #32. Search (#31) should not use the floor.
- **Deleting a user** must also run `favorites.deleteMany({ userId })`, and
  (M6) `mealLogs.deleteMany({ userId })`. Their submissions stay, since applied
  edits already changed shared data.
- **Meal logs (#108).** A range read is `mealLogs.find({ userId, date: { $gte: from, $lte: to } })`
  on the `user_date` index (`YYYY-MM-DD` strings sort like dates). Day totals:
  query 23 in `queries.md` does it in the database.
- **Submissions (#109, #110).** The admin queue is query 24 (`status_created`);
  "my submissions" and the 10-per-24-hours limit read `user_created`.
- **Role and tracked nutrients** may be missing on any user: treat a missing
  `role` as `"user"` and a missing `trackedNutrients` as `["calories", "protein"]`.
  MongoDB has no `ON DELETE CASCADE`.
- **Verifying a menu item:** `$set` `isEstimate: false`, `source: "official"`
  and `lastVerified: new Date()` together (query 20). The database refuses
  `isEstimate: false` without the date.

## Design decisions (talking points for the GTA)

- **Why MongoDB has a schema at all.** MongoDB doesn't require one, but each
  collection has a `$jsonSchema` validator, so the *database* rejects bad
  documents (missing fields, wrong types, `activityLevel: "couch"`), not just
  our API code. Demo: queries 9a–9f and 19a–19e in `queries.md`.
- **Age is enforced by the database too.** `$jsonSchema` can't compare a date
  with today, so the users validator adds an `$expr` rule: `birthDate` between
  120 and 18 years ago (queries 9d, 9e). The upper bound stops a typo like
  1826 from producing a negative calorie target.
- **Profile and preferences are embedded in the user, not their own
  collections.** They're 1:1 with the user and always read together, so
  embedding means one read, no join.
- **Birth date, not age.** A stored age goes stale every birthday; age is
  computed from `birthDate` when the calories are calculated.
- **Username and email are both unique, and both lowercase.** The validator
  rejects uppercase in either, so `Jane.Doe@` can't sneak past the unique
  index next to `jane.doe@` (query 9f).
- **Chains, not restaurants.** A chain is a brand with one menu. Locations
  come live from the Places API and are never stored, so the database never
  holds anyone's location.
- **Alternate spellings live on the chain.** Places might return
  "Chickfila" or "Raising Canes Chicken Fingers". Storing those normalized
  spellings, with an index, turns matching into one exact lookup instead of
  fuzzy matching in code.
- **Menu items are their own collection, referencing chains.** The main
  search is *across* chains ("high-protein items under 500 calories"), which
  is one query on `menuItems`. If items were arrays inside each chain, that
  would need an `$unwind` every time.
- **`chainName` is copied into each menu item (denormalized).** Search
  results need to show the chain name; copying it avoids a `$lookup` on
  every keystroke. Chain names rarely change.
- **Search uses a normalized `searchName`.** Searching "chick fil" finds
  "Chick-fil-A", and the regex runs over the `search_name` index rather than
  every document (query 12b shows `IXSCAN`).
- **Unknown macros are `null`, never 0.** A 0 would be ranked as a real value
  (0 g carbs would look perfect for a low-carb search). Calories can't be
  null: chains are legally required to publish them.
- **`isEstimate` + `source` + `lastVerified` on every menu item.** The app
  must say when numbers are estimates and hides them by default (R4). An item
  only counts as verified with a date on it (query 19c). All 85 seeded items
  were checked against each chain's official nutrition source on 2026-10-26
  (#28; Chipotle publishes ingredients, so its 3 bowls/burritos are sums of
  those verified values); several draft values were wrong (e.g. Orange Chicken is 560 cal, not
  490), which is exactly why the flag exists.
- **Favorites store only user + place ID + optional label (spec N4).**
  `additionalProperties: false` means the database refuses an address or
  coordinates (query 19b). The unique (userId, placeId) index stops
  duplicates (query 19a) and also serves "list my favorites".
- **Calorie targets are calculated, not stored.** Maintenance calories come
  from the profile (Mifflin-St Jeor × activity multiplier; −500 to lose, 0 to
  maintain, +300 to gain). The per-meal limit is the user's own
  `mealCalorieLimit` if set, otherwise target ÷ 3.
  Storing them would go stale whenever the profile changes. Query 21 shows the
  formula running inside the database.
- **Passwords are bcrypt hashes; email/reset tokens are stored as SHA-256
  hashes.** If the database leaked, nobody could log in or use a reset link
  with what's stored. Tokens have expiry dates.
- **Indexes.** Unique `email` and `username` (no duplicate accounts, fast
  login lookup); partial indexes on the token hashes (only users with a
  pending token are indexed); `nameKey` and `alternateNames` (chain matching);
  `searchName` (menu search); `calories + proteinG` and `calories + carbsG`
  (recommendations); unique (userId, placeId) on favorites.
- **Height and weight are always stored imperial** (inches, pounds). If
  `preferences.units` is `metric`, the API converts for display, so there's
  one stored format and no rounding drift.
- **`recommendationMode` is the user's choice** (`protein` or `carb`): it
  decides whether results are ranked by protein (query 16) or carbs (query 17).
- **`schema.js` checks every command.** `runCommand` doesn't throw on failure,
  so `schema.js` checks `ok` itself; a rejected validator stops the script
  instead of silently keeping the old one.
- **Meal logs are snapshots, not live links (M6).** Each entry copies the name,
  chain and macros when it's made. If a community edit later fixes the item, or
  a reverted submission deletes it, yesterday's totals don't silently change.
  Same idea as `chainName` on menu items, for history instead of speed.
- **New fields are optional, not required (M6).** Strict validation applies to
  every update, so making `role` or `trackedNutrients` required would block
  updates to every account created before M6. Missing values have defaults.
- **Admins can't be made through the API or the seed (M6).** The seed admin is
  opt-in (`SEED_ADMIN=1`) because this repo, and its passwords, are public;
  production admins come from `make-admin.js`, which needs shell access.
- **The database checks what it can about submissions.** `payload` changes
  shape with `kind`, so the API validates it, but the database still rejects
  unknown kinds, statuses and flags, and a `new_chain` with a target (or any
  other kind without one).
