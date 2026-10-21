QUERIES (run inside `mongosh` after schema.js + seed.js):

```js
// --- Look around (MongoDB's SHOW DATABASES / SHOW TABLES / DESCRIBE) ---
1.  show dbs
2.  use MenuMacroFitter
3.  show collections
4.  db.getCollectionInfos({ name: "users" })[0].options.validator   // the users "schema"
5.  db.users.getIndexes()                                            // unique email + token indexes

// --- users (required: User table created and populated) ---
6.  db.users.find({}, { passwordHash: 0 })                           // all users, hide the hash
7.  db.users.findOne({ email: "jane.doe@example.com" }, { passwordHash: 0 })
8.  db.users.find({ isVerified: false }, { email: 1, verificationTokenExpires: 1 })   // who can't log in yet

// --- the database enforces the rules (each of these is REJECTED) ---
9a. db.users.insertOne({ firstName: "Bad" })                         // missing required fields
9b. db.users.insertOne({ firstName: "Dup", lastName: "User", email: "jane.doe@example.com",
      passwordHash: "x", isVerified: false, createdAt: new Date(), updatedAt: new Date() })   // duplicate email
9c. db.users.insertOne({ firstName: "P", lastName: "Q", email: "pq@example.com", passwordHash: "x",
      isVerified: true, createdAt: new Date(), updatedAt: new Date(),
      profile: { heightIn: 70, weightLb: 150, age: 20, sex: "male", activityLevel: "couch", goal: "lose" } })  // bad enum

// --- restaurants and menu items ---
10. db.restaurants.find()
11. db.menuItems.find({ restaurantName: "Panda Express" }, { _id: 0, name: 1, calories: 1, proteinG: 1 })

// --- what the search API runs: partial, case-insensitive match ---
12. db.menuItems.find({ name: { $regex: "chick", $options: "i" } }, { _id: 0, restaurantName: 1, name: 1, calories: 1 })

// --- what "fits my goal" runs: under a per-meal limit, ranked ---
13. db.menuItems.find({ calories: { $lte: 500 } }, { _id: 0, restaurantName: 1, name: 1, calories: 1, proteinG: 1 }).sort({ proteinG: -1 }).limit(5)   // high-protein
14. db.menuItems.find({ calories: { $lte: 500 } }, { _id: 0, restaurantName: 1, name: 1, calories: 1, carbsG: 1 }).sort({ carbsG: -1 }).limit(5)       // high-carb

// --- join: menu items per restaurant (MongoDB's JOIN is $lookup) ---
15. db.restaurants.aggregate([
      { $lookup: { from: "menuItems", localField: "_id", foreignField: "restaurantId", as: "items" } },
      { $project: { _id: 0, name: 1, itemCount: { $size: "$items" } } }
    ])

// --- daily calorie targets from each profile (Mifflin-St Jeor) ---
16. db.users.aggregate([
      { $match: { profile: { $ne: null } } },
      { $set: { kg: { $multiply: ["$profile.weightLb", 0.453592] }, cm: { $multiply: ["$profile.heightIn", 2.54] } } },
      { $set: { bmr: { $add: [
        { $multiply: [10, "$kg"] }, { $multiply: [6.25, "$cm"] }, { $multiply: [-5, "$profile.age"] },
        { $cond: [{ $eq: ["$profile.sex", "male"] }, 5, -161] } ] } } },
      { $set: { maintenance: { $round: [{ $multiply: ["$bmr", { $switch: { branches: [
        { case: { $eq: ["$profile.activityLevel", "sedentary"] }, then: 1.2 },
        { case: { $eq: ["$profile.activityLevel", "light"] }, then: 1.375 },
        { case: { $eq: ["$profile.activityLevel", "moderate"] }, then: 1.55 },
        { case: { $eq: ["$profile.activityLevel", "active"] }, then: 1.725 } ], default: 1.9 } }] }, 0] } } },
      { $set: { target: { $add: ["$maintenance", { $switch: { branches: [
        { case: { $eq: ["$profile.goal", "lose"] }, then: -500 },
        { case: { $eq: ["$profile.goal", "gain"] }, then: 500 } ], default: 0 } }] } } },
      { $project: { _id: 0, email: 1, goal: "$profile.goal", maintenance: 1, target: 1,
                    perMeal: { $round: [{ $divide: ["$target", 3] }, 0] } } }
    ])
```

Expected results with the seed data: 6 users (1 unverified), 3 restaurants,
16 menu items; query 12 finds 8 items; query 16 gives Jane a maintenance of
2058 and a target of 1558 (519 per meal).
