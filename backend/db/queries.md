QUERIES (run inside `mongosh` after schema.js + seed.js):

```js
// --- Look around (MongoDB's SHOW DATABASES / SHOW TABLES / DESCRIBE) ---
1.  show dbs
2.  use MenuMacroFitter
3.  show collections
4.  db.getCollectionInfos({ name: "users" })[0].options.validator   // the users "schema" + 18+ rule
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

// --- restaurants and menu items ---
10. db.restaurants.find()
11. db.menuItems.find({ restaurantName: "Panda Express" }, { _id: 0, name: 1, calories: 1, proteinG: 1 })

// --- what the search API runs: partial, case-insensitive match ---
12. db.menuItems.find({ name: { $regex: "chick", $options: "i" } }, { _id: 0, restaurantName: 1, name: 1, calories: 1 })

// --- what recommendations run: under a per-meal limit, ranked by the user's recommendationMode ---
13. db.menuItems.find({ calories: { $lte: 500 } }, { _id: 0, restaurantName: 1, name: 1, calories: 1, proteinG: 1 }).sort({ proteinG: -1 }).limit(5)   // mode "protein"
14. db.menuItems.find({ calories: { $lte: 500 } }, { _id: 0, restaurantName: 1, name: 1, calories: 1, carbsG: 1 }).sort({ carbsG: -1 }).limit(5)       // mode "carb"

// --- join: menu items per restaurant (MongoDB's JOIN is $lookup) ---
15. db.restaurants.aggregate([
      { $lookup: { from: "menuItems", localField: "_id", foreignField: "restaurantId", as: "items" } },
      { $project: { _id: 0, name: 1, itemCount: { $size: "$items" } } }
    ])

// --- daily calorie targets from each profile (Mifflin-St Jeor) ---
// age is computed from birthDate (whole years); goal adjusts -500 / 0 / +300;
// perMeal is the user's own mealCalorieLimit if set, otherwise target / 3.
16. db.users.aggregate([
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
```

Expected results with the seed data: 6 users (1 unverified, 1 with profile
null), 3 restaurants, 16 menu items; 9a–9d are all rejected; query 12 finds 8
items. Query 16 (as of October 2026) gives:

| username | goal | maintenance | target | perMeal |
|---|---|---|---|---|
| janedoe | lose | 2058 | 1558 | 519 |
| kevinn | gain | 2957 | 3257 | 1086 |
| marial | maintain | 2044 | 2044 | 681 |
| chrisb | lose | 2377 | 1877 | 600 (own limit) |

Ages move up by one on each birthday, which shifts maintenance by about 5–8
calories.
