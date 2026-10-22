# Database (MongoDB)

Database name: **`MenuMacroFitter`**

| File | What it does | Small-project equivalent |
|---|---|---|
| `schema.js` | Creates the 3 collections with validation rules and indexes | `sql/schema.sql` |
| `seed.js` | Deletes everything, then inserts test users, restaurants, menu items | `sql/database/seed.sql` |
| `menu-data/ucf-campus.js` | UCF campus restaurants + menu items (edit this to add food) | — |
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
  `null` until the user fills it in. Users must be 18 or older.
- `preferences` = `{ units, searchRadius, recommendationMode, mealCalorieLimit }`,
  set to defaults at registration (`imperial`, `5`, `protein`, `null`).

**`restaurants`**: `name, campusLocation, menuSourceUrl, createdAt`.
Unique on (name, campusLocation).

**`menuItems`**: `restaurantId → restaurants._id, restaurantName, name,
category, calories, proteinG, carbsG, fatG, isEstimate, source, lastVerified`.

```
users            restaurants 1 ──── * menuItems
(no relationship to food: the app does not log meals)
```

## Design decisions (talking points for the GTA)

- **Why MongoDB has a schema at all.** MongoDB doesn't require one, but each
  collection has a `$jsonSchema` validator, so the *database* rejects bad
  documents (missing fields, wrong types, `activityLevel: "couch"`), not just
  our API code. Demo: queries 9a–9d in `queries.md`.
- **18+ is enforced by the database too.** `$jsonSchema` can't compare a date
  with today, so the users validator adds an `$expr` rule:
  `birthDate <= now − 18 years` (query 9d).
- **Profile and preferences are embedded in the user, not their own
  collections.** They're 1:1 with the user and always read together, so
  embedding means one read, no join.
- **Birth date, not age.** A stored age goes stale every birthday; age is
  computed from `birthDate` when the calories are calculated.
- **Username and email are both unique.** Registration collects a username
  (stored lowercase); email is still what verification and reset use.
- **Menu items are their own collection, referencing restaurants.** The main
  search is *across* restaurants ("high-protein items under 500 calories"),
  which is one query on `menuItems`. If items were arrays inside each
  restaurant, that would need an `$unwind` every time.
- **`restaurantName` is copied into each menu item (denormalized).** Search
  results need to show the restaurant name; copying it avoids a `$lookup` on
  every keystroke. Restaurant names rarely change.
- **Calorie targets are calculated, not stored.** Maintenance calories come
  from the profile (Mifflin-St Jeor × activity multiplier; −500 to lose, 0 to
  maintain, +300 to gain). The per-meal limit is the user's own
  `mealCalorieLimit` if set, otherwise target ÷ 3.
  Storing them would go stale whenever the profile changes. Query 16 shows the
  formula running inside the database.
- **Passwords are bcrypt hashes; email/reset tokens are stored as SHA-256
  hashes.** If the database leaked, nobody could log in or use a reset link
  with what's stored. Tokens have expiry dates.
- **Indexes.** Unique `email` and `username` (no duplicate accounts, fast login lookup);
  partial indexes on the token hashes (only users with a pending token are
  indexed); `restaurantId` on menu items (the join); `calories + proteinG` for
  the "fits my goal" query.
- **Partial-match search** uses a case-insensitive `$regex` on the server
  (query 12). The API must escape regex characters in what the user types.
- **`isEstimate` + `source` on every menu item.** Many restaurants don't
  publish nutrition, so the app must say when numbers are estimates. Seed
  values are all marked `isEstimate: true` until someone checks them against
  the official page.
- **Height and weight are always stored imperial** (inches, pounds). If
  `preferences.units` is `metric`, the API converts for display, so there's
  one stored format and no rounding drift.
- **`recommendationMode` is the user's choice** (`protein` or `carb`): it
  decides whether results are ranked by protein (query 13) or carbs (query 14).
- **Later (issue #29):** `restaurants` becomes `chains` (unique name, alternate
  spellings, source URL) and a `favorites` collection is added, once location
  filtering with a places API is built. `preferences.searchRadius` is already
  stored for that. For now the app only covers the UCF campus.
