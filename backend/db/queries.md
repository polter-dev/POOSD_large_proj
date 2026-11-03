QUERIES (run inside `mongosh` after schema.js + seed.js):

```js
// --- Look around (MongoDB's SHOW DATABASES / SHOW TABLES / DESCRIBE) ---
1.  show dbs
2.  use MenuMacroFitter
3.  show collections                                                 // chains, favorites, menuItems, users
4.  db.getCollectionInfos({ name: "users" })[0].options.validator   // the users "schema" + age rule
5.  db.users.getIndexes()                                            // unique email/username + token indexes

// --- users (required: User table created and populated) ---
6.  db.users.find({}, { passwordHash: 0 })                           // all users, hide the hash
7.  db.users.findOne({ username: "janedoe" }, { passwordHash: 0 })
8.  db.users.find({ isVerified: false }, { username: 1, email: 1, verificationTokenExpires: 1 })   // who can't log in yet

// --- the database enforces the rules (each of these is REJECTED) ---
9a. db.users.insertOne({ firstName: "Bad" })                         // missing required fields
9b. db.users.insertOne({ firstName: "Dup", lastName: "User", username: "dupuser", email: "jane.doe@example.com",
      passwordHash: "x", isVerified: false,
      preferences: { units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null },
      createdAt: new Date(), updatedAt: new Date() })                // duplicate email
9c. db.users.insertOne({ firstName: "P", lastName: "Q", username: "pq", email: "pq@example.com", passwordHash: "x",
      isVerified: true, createdAt: new Date(), updatedAt: new Date(),
      preferences: { units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null },
      profile: { heightIn: 70, weightLb: 150, birthDate: new Date("2000-01-01"), sex: "male", activityLevel: "couch", goal: "lose" } })  // bad enum
9d. db.users.insertOne({ firstName: "Young", lastName: "User", username: "younguser", email: "young@example.com", passwordHash: "x",
      isVerified: true, createdAt: new Date(), updatedAt: new Date(),
      preferences: { units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null },
      profile: { heightIn: 65, weightLb: 120, birthDate: new Date("2012-05-01"), sex: "female", activityLevel: "light", goal: "maintain" } })  // under 18
9e. db.users.updateOne({ username: "janedoe" }, { $set: { "profile.birthDate": new Date("1826-03-14") } })   // typo: over 120
9f. db.users.insertOne({ firstName: "Case", lastName: "User", username: "caseuser", email: "Jane.Doe@example.com",
      passwordHash: "x", isVerified: false,
      preferences: { units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null },
      createdAt: new Date(), updatedAt: new Date() })                // uppercase email (would dodge the unique index)

// --- chains and menu items ---
10. db.chains.find({}, { _id: 0, name: 1, nameKey: 1, alternateNames: 1 })
11. db.menuItems.find({ chainName: "Panda Express" }, { _id: 0, name: 1, calories: 1, proteinG: 1 })

// --- what the search API runs (#31): partial match on the normalized name ---
// The API normalizes what the user typed the same way (so "Chick-fil" -> "chick fil")
// and escapes regex characters before building the pattern.
12. db.menuItems.find({ searchName: { $regex: "chick" } }, { _id: 0, chainName: 1, name: 1, calories: 1 })
12b. db.menuItems.find({ searchName: { $regex: "chick" } }).explain().queryPlanner.winningPlan   // IXSCAN on search_name, not a full scan

// --- what the nearby search runs (#30): match a Places result to a chain ---
// Places returns "Chickfila"; the API normalizes it to "chickfila" and looks it up.
13. db.chains.findOne({ $or: [{ nameKey: "chickfila" }, { alternateNames: "chickfila" }] }, { _id: 0, name: 1 })
13b. db.chains.findOne({ $or: [{ nameKey: "joes crab shack" }, { alternateNames: "joes crab shack" }] })   // no match -> null

// --- join: which chains have nutrition data (MongoDB's JOIN is $lookup) ---
14. db.chains.aggregate([
      { $lookup: { from: "menuItems", localField: "_id", foreignField: "chainId", as: "items" } },
      { $project: { _id: 0, name: 1, itemCount: { $size: "$items" },
                    verified: { $size: { $filter: { input: "$items", cond: { $eq: ["$$this.isEstimate", false] } } } } } },
      { $sort: { name: 1 } }
    ])

// --- what recommendations run (#32): under the per-meal limit, ranked by g per 100 kcal ---
// Spec R4: estimates are hidden by default, so the API adds isEstimate: false
// unless the user turned estimates on. Every seeded item is verified (#28).
15. db.menuItems.countDocuments({ isEstimate: false, calories: { $lte: 519 }, proteinG: { $ne: null } })     // how many fit janedoe's meal
16. db.menuItems.aggregate([
      { $match: { isEstimate: false, calories: { $gt: 0, $lte: 519 }, proteinG: { $ne: null } } },
      { $set: { score: { $round: [{ $multiply: [{ $divide: ["$proteinG", "$calories"] }, 100] }, 1] } } },
      { $sort: { score: -1 } }, { $limit: 5 },
      { $project: { _id: 0, chainName: 1, name: 1, calories: 1, proteinG: 1, score: 1 } }
    ])                                                                                                   // mode "protein"
17. db.menuItems.aggregate([
      { $match: { isEstimate: false, calories: { $gt: 0, $lte: 519 }, carbsG: { $ne: null } } },
      { $set: { score: { $round: [{ $multiply: [{ $divide: ["$carbsG", "$calories"] }, 100] }, 1] } } },
      { $sort: { score: -1 } }, { $limit: 5 },
      { $project: { _id: 0, chainName: 1, name: 1, calories: 1, carbsG: 1, score: 1 } }
    ])                                                                                                   // mode "carb"

// --- favorites (#33): one user's saved places ---
18. db.favorites.find({ userId: db.users.findOne({ username: "janedoe" })._id }, { _id: 0, placeId: 1, label: 1 })

// --- more rules the database enforces (each of these is REJECTED) ---
19a. db.favorites.insertOne({ userId: db.users.findOne({ username: "janedoe" })._id,
       placeId: "ChIJdemo_ChickfilA_StudentUnion", label: null, createdAt: new Date() })   // same place saved twice
19b. db.favorites.insertOne({ userId: db.users.findOne({ username: "sampatel" })._id,
       placeId: "ChIJdemo_Wendys_Alafaya", label: null, createdAt: new Date(),
       address: "12100 Alafaya Trail" })                                                    // spec N4: no address/location stored
19c. db.menuItems.updateOne({ name: "Big Mac" }, { $set: { lastVerified: null } })        // verified item with its date removed
19d. db.menuItems.updateOne({ name: "Big Mac" }, { $set: { proteinG: "unknown" } })        // unknown macros are null, not text
19e. db.chains.insertOne({ name: "CHICK-FIL-A", nameKey: "chick fil a", alternateNames: [],
       nutritionSourceUrl: "https://www.chick-fil-a.com/nutrition-allergens",
       createdAt: new Date(), updatedAt: new Date() })                                      // duplicate chain

// --- this one is ACCEPTED: re-checking an item against the official page (#28) ---
20. db.menuItems.updateOne({ name: "Big Mac" },
      { $set: { calories: 580, isEstimate: false, source: "official", lastVerified: new Date() } })

// --- daily calorie targets from each profile (Mifflin-St Jeor) ---
// age is computed from birthDate (whole years); goal adjusts -500 / 0 / +300;
// perMeal is the user's own mealCalorieLimit if set, otherwise target / 3.
21. db.users.aggregate([
      { $match: { profile: { $ne: null } } },
      { $set: { age: { $let: {
        vars: { y: { $dateDiff: { startDate: "$profile.birthDate", endDate: "$$NOW", unit: "year" } } },
        in: { $cond: [{ $gt: [{ $dateAdd: { startDate: "$profile.birthDate", unit: "year", amount: "$$y" } }, "$$NOW"] },
                      { $subtract: ["$$y", 1] }, "$$y"] } } } } },
      { $set: { kg: { $multiply: ["$profile.weightLb", 0.453592] }, cm: { $multiply: ["$profile.heightIn", 2.54] } } },
      { $set: { bmr: { $add: [
        { $multiply: [10, "$kg"] }, { $multiply: [6.25, "$cm"] }, { $multiply: [-5, "$age"] },
        { $cond: [{ $eq: ["$profile.sex", "male"] }, 5, -161] } ] } } },
      { $set: { maintenance: { $round: [{ $multiply: ["$bmr", { $switch: { branches: [
        { case: { $eq: ["$profile.activityLevel", "sedentary"] }, then: 1.2 },
        { case: { $eq: ["$profile.activityLevel", "light"] }, then: 1.375 },
        { case: { $eq: ["$profile.activityLevel", "moderate"] }, then: 1.55 },
        { case: { $eq: ["$profile.activityLevel", "active"] }, then: 1.725 } ], default: 1.9 } }] }, 0] } } },
      { $set: { target: { $add: ["$maintenance", { $switch: { branches: [
        { case: { $eq: ["$profile.goal", "lose"] }, then: -500 },
        { case: { $eq: ["$profile.goal", "gain"] }, then: 300 } ], default: 0 } }] } } },
      { $project: { _id: 0, username: 1, age: 1, goal: "$profile.goal", mode: "$preferences.recommendationMode",
                    maintenance: 1, target: 1,
                    perMeal: { $ifNull: ["$preferences.mealCalorieLimit", { $round: [{ $divide: ["$target", 3] }, 0] }] } } }
    ])

// --- M6: meal logs (#107) ---
22. db.mealLogs.find({ userId: db.users.findOne({ username: "janedoe" })._id },
      { _id: 0, date: 1, status: 1, name: 1, chainName: 1, servings: 1, calories: 1, source: 1 }).sort({ date: 1, createdAt: 1 })

// A day's totals, what GET /meal-logs returns per day (#108): value x servings, eaten and planned apart.
// A null macro adds nothing and marks the day incomplete ("at least").
23. db.mealLogs.aggregate([
      { $match: { userId: db.users.findOne({ username: "janedoe" })._id } },
      { $group: { _id: { date: "$date", status: "$status" }, entries: { $sum: 1 },
        calories: { $sum: { $multiply: ["$calories", "$servings"] } },
        proteinG: { $sum: { $multiply: [{ $ifNull: ["$proteinG", 0] }, "$servings"] } },
        carbsG: { $sum: { $multiply: [{ $ifNull: ["$carbsG", 0] }, "$servings"] } },
        fatG: { $sum: { $multiply: [{ $ifNull: ["$fatG", 0] }, "$servings"] } },
        incomplete: { $max: { $or: [{ $eq: ["$proteinG", null] }, { $eq: ["$carbsG", null] }, { $eq: ["$fatG", null] }] } } } },
      { $project: { _id: 0, date: "$_id.date", status: "$_id.status", entries: 1, incomplete: 1,
        calories: { $round: ["$calories", 0] }, proteinG: { $round: ["$proteinG", 1] },
        carbsG: { $round: ["$carbsG", 1] }, fatG: { $round: ["$fatG", 1] } } },
      { $sort: { date: 1, status: 1 } }
    ])

// --- M6: submissions (#107) ---
// The admin queue (#109): pending, oldest first, with who sent it (a JOIN on users).
24. db.submissions.aggregate([
      { $match: { status: "pending" } },
      { $sort: { createdAt: 1 } },
      { $lookup: { from: "users", localField: "userId", foreignField: "_id", as: "user" } },
      { $project: { _id: 0, kind: 1, payload: 1, flags: 1, createdAt: 1, user: { $first: "$user.username" } } }
    ])
24b. db.submissions.find({ status: "pending" }).sort({ createdAt: 1 }).explain().queryPlanner.winningPlan   // IXSCAN on status_created

// --- M6 rules the database enforces (each of these is REJECTED) ---
25a. db.mealLogs.insertOne({ userId: db.users.findOne({ username: "janedoe" })._id, date: "2026-11-03", status: "eaten",
       menuItemId: null, name: "Apple", chainName: null, servings: 1, calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3,
       source: "custom", createdAt: new Date(), notes: "crisp" })                                   // extra field
25b. db.mealLogs.insertOne({ userId: db.users.findOne({ username: "janedoe" })._id, date: "2026-11-03", status: "skipped",
       menuItemId: null, name: "Apple", chainName: null, servings: 1, calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3,
       source: "custom", createdAt: new Date() })                                                  // bad status
25c. db.mealLogs.insertOne({ userId: db.users.findOne({ username: "janedoe" })._id, date: "11/03/2026", status: "eaten",
       menuItemId: null, name: "Apple", chainName: null, servings: 0, calories: 95, proteinG: 0.5, carbsG: 25, fatG: 0.3,
       source: "custom", createdAt: new Date() })                                                  // date format, 0 servings
25d. db.submissions.insertOne({ userId: db.users.findOne({ username: "kevinn" })._id, kind: "delete_item",
       targetId: db.menuItems.findOne({ name: "Big Mac" })._id, payload: {}, before: null, resultId: null, status: "pending",
       flags: [], reviewedBy: null, reviewNote: null, createdAt: new Date(), updatedAt: new Date() })   // unknown kind
25e. db.submissions.insertOne({ userId: db.users.findOne({ username: "kevinn" })._id, kind: "new_chain",
       targetId: db.chains.findOne({ name: "Subway" })._id, payload: { name: "Arby's", nutritionSourceUrl: "https://arbys.com" },
       before: null, resultId: null, status: "pending", flags: ["new_chain"], reviewedBy: null, reviewNote: null,
       createdAt: new Date(), updatedAt: new Date() })                                             // new_chain with a target
25f. db.submissions.updateOne({ status: "pending" }, { $set: { flags: ["spam"] } })                 // unknown flag
25g. db.users.updateOne({ username: "janedoe" }, { $set: { role: "superuser" } })                    // bad role
25h. db.users.updateOne({ username: "janedoe" }, { $set: { "preferences.trackedNutrients": ["calories", "sugar"] } })   // bad nutrient

// --- ACCEPTED: an account from before M6 (no role, no trackedNutrients) can still be updated ---
26. db.users.updateOne({ username: "chrisb" }, { $set: { "preferences.searchRadius": 15, updatedAt: new Date() } })
```

519 in queries 15–17 is janedoe's per-meal limit from query 21.

## Expected results with the seed data

- 6 collections, 6 users (1 unverified, 1 with profile null; 7 with
  `SEED_ADMIN=1`, adding `siteadmin`), 10 chains, 86 menu items (85 verified
  against official sources on 2026-10-26, the 3 Chipotle builds being sums of
  verified ingredients, plus 1 community estimate from a submission),
  3 favorites, 6 meal logs, 2 submissions.
- **Rejected:** 9a–9f, 19a–19e and 25a–25h. **Accepted:** queries 20 and 26.
- Query 12 finds 31 items ("chick" also matches "chicken"); 12b shows
  `IXSCAN` on `search_name`.
- Query 13 returns Chick-fil-A; 13b returns `null` (the API shows the place
  without nutrition data).
- Query 14: 5–13 items per chain, every one verified except Subway's
  community "6-inch Veggie Delite" (7 items, 6 verified).
- Query 15 returns 65.
- Query 16 (protein), g per 100 kcal: Chick-fil-A Grilled Nuggets (8 ct) 19.2,
  Grilled Nuggets (12 ct) 19, Chipotle Chicken (4 oz) 17.8, Popeyes Blackened
  Tenders (5 pc) 16.8, Blackened Tenders (3 pc) 16.5.
- Query 17 (carb): Fruit Cup 22.9, Plain Baked Potato 22.6, Cilantro-Lime
  White Rice 19, Cilantro-Lime Brown Rice 17.1, Black Beans 16.9. The Fruit
  Cup tops it on only 70 calories: the "minimum-calorie floor" question in #32.
- Query 18: janedoe's 2 favorites (one has no label).
- Query 21 (as of October 2026):

| username | goal | maintenance | target | perMeal |
|---|---|---|---|---|
| janedoe | lose | 2058 | 1558 | 519 |
| kevinn | gain | 2957 | 3257 | 1086 |
| marial | maintain | 2044 | 2044 | 681 |
| chrisb | lose | 2377 | 1877 | 600 (own limit) |

Ages move up by one on each birthday, which shifts maintenance by about 5–8
calories.

- Query 22: janedoe's 6 entries, yesterday then today (dates are relative to
  when `seed.js` ran, in UCF's time zone).
- Query 23 (day totals; the macros are value × servings):

| date | status | entries | calories | protein | carbs | fat | incomplete |
|---|---|---|---|---|---|---|---|
| yesterday | eaten | 4 | 1480 | 129 | 160.5 | 34 | true (the smoothie's fat is unknown) |
| today | eaten | 1 | 130 | 25 | 1 | 3 | false |
| today | planned | 1 | 300 | 26 | 40 | 5 | false |

- Query 24: one pending submission, kevinn's Big Mac edit, flagged `verified_item`.
  24b shows `IXSCAN` on `status_created`.

Queries 20 and 26 change data, so re-run `seed.js` afterwards to reset.
