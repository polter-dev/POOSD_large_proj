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
for which account is in which state (verified, unverified, reset pending...).

## Collections

**`users`**: one per account.
`firstName, lastName, email (unique), passwordHash, isVerified,
verificationTokenHash/Expires, resetTokenHash/Expires, profile, createdAt, updatedAt`.
`profile` = `{ heightIn, weightLb, age, sex, activityLevel, goal }`, or `null`
until the user fills it in.

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
  our API code. Demo: queries 9a–9c in `queries.md`.
- **Profile is embedded in the user, not its own collection.** It's 1:1 with
  the user and always read together, so embedding means one read, no join.
- **Menu items are their own collection, referencing restaurants.** The main
  search is *across* restaurants ("high-protein items under 500 calories"),
  which is one query on `menuItems`. If items were arrays inside each
  restaurant, that would need an `$unwind` every time.
- **`restaurantName` is copied into each menu item (denormalized).** Search
  results need to show the restaurant name; copying it avoids a `$lookup` on
  every keystroke. Restaurant names rarely change.
- **Calorie targets are calculated, not stored.** Maintenance calories come
  from the profile (Mifflin-St Jeor × activity multiplier, ±500 for lose/gain).
  Storing them would go stale whenever the profile changes. Query 16 shows the
  formula running inside the database.
- **Passwords are bcrypt hashes; email/reset tokens are stored as SHA-256
  hashes.** If the database leaked, nobody could log in or use a reset link
  with what's stored. Tokens have expiry dates.
- **Indexes.** Unique `email` (no duplicate accounts, fast login lookup);
  partial indexes on the token hashes (only users with a pending token are
  indexed); `restaurantId` on menu items (the join); `calories + proteinG` for
  the "fits my goal" query.
- **Partial-match search** uses a case-insensitive `$regex` on the server
  (query 12). The API must escape regex characters in what the user types.
- **`isEstimate` + `source` on every menu item.** Many restaurants don't
  publish nutrition, so the app must say when numbers are estimates. Seed
  values are all marked `isEstimate: true` until someone checks them against
  the official page.
- **Imperial units** (inches, pounds), because that's what UCF students
  know; the formula converts to metric.
- **Later:** location filtering (5/10/15/20 miles) will add a GeoJSON
  `location` field and a `2dsphere` index to `restaurants`. For now the app
  only covers the UCF campus.
