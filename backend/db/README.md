# Database (MongoDB)

Database name: **`MenuMacroFitter`** (MongoDB 5.0+)

| File | What it does | Small-project equivalent |
|---|---|---|
| `schema.js` | Creates the 4 collections with validation rules and indexes | `sql/schema.sql` |
| `seed.js` | Deletes everything, then inserts test users, chains, menu items, favorites | `sql/database/seed.sql` |
| `menu-data/chains.js` | Restaurant chains + menu items (edit this to add or verify food) | — |
| `queries.md` | Demo queries for the GTA, with expected results | `sql/database/queries.md` |

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
reset pending).

## Collections

**`users`**: one per account.
`firstName, lastName, username (unique), email (unique), passwordHash, isVerified,
verificationTokenHash/Expires, resetTokenHash/Expires, profile, preferences,
createdAt, updatedAt`.
- `profile` = `{ heightIn, weightLb, birthDate, sex, activityLevel, goal }`, or
  `null` until the user fills it in. Users must be 18–120 years old.
- `preferences` = `{ units, searchRadius, recommendationMode, mealCalorieLimit }`,
  set to defaults at registration (`imperial`, `5`, `protein`, `null`).

**`chains`**: one per restaurant brand (not per location).
`name, nameKey (unique), alternateNames, nutritionSourceUrl, createdAt, updatedAt`.

**`menuItems`**: `chainId → chains._id, chainName, name, searchName, category,
calories, proteinG, carbsG, fatG, isEstimate, source, lastVerified`.
Unique on (chainId, searchName).

**`favorites`**: `userId → users._id, placeId, label, createdAt`.
Unique on (userId, placeId).

```
users 1 ──── * favorites          chains 1 ──── * menuItems
(no link between users and food: the app does not log meals)
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
- **Deleting a user** must also run `favorites.deleteMany({ userId })`.
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
