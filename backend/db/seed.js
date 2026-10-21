// seed.js  (mongosh script)
//
// Fills MenuMacroFitter with test users, the UCF campus restaurants, and
// their menu items, so developers and the demo have data to query.
//
// SAFE TO RE-RUN: deletes existing documents first, so running it twice does
// not create duplicates. Run it AFTER schema.js, from this folder:
//   mongosh "<connection string>" schema.js seed.js
//
// TEST ACCOUNTS (plain-text password below is for testing only -- never do
// this with real user data). Every account's password is: Password123!
//   jane.doe@example.com      verified, profile filled in (lose)
//   kevin.nguyen@example.com  verified, profile filled in (gain)
//   maria.lopez@example.com   verified, profile filled in (maintain)
//   sam.patel@example.com     verified, no profile yet (just registered)
//   alex.kim@example.com      NOT verified -- login must be refused
//   chris.brown@example.com   verified, password reset in progress
//
// The hash below was generated with bcryptjs:
//   node -e "console.log(require('bcryptjs').hashSync('Password123!', 10))"
// so the backend's bcrypt.compare() will accept "Password123!" for every account.
//
// Token hashes are SHA-256 of the raw tokens "demo-verify-token" and
// "demo-reset-token" (the raw token is what the email link would contain).

db = db.getSiblingDB("MenuMacroFitter");
load("menu-data/ucf-campus.js"); // defines UCF_CAMPUS_MENUS

const PASSWORD_HASH = "$2b$10$fYkTDYUE26dcsyJDdm8T2.ePWbXs35ePgSzevHC1y6fEpOm85Py/u";
const now = new Date();
const inOneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

// Clear existing data first (menuItems reference restaurants).
db.menuItems.deleteMany({});
db.restaurants.deleteMany({});
db.users.deleteMany({});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
function user(firstName, lastName, email, extra) {
  return {
    firstName,
    lastName,
    email,
    passwordHash: PASSWORD_HASH,
    isVerified: true,
    verificationTokenHash: null,
    verificationTokenExpires: null,
    resetTokenHash: null,
    resetTokenExpires: null,
    profile: null,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

const users = db.users.insertMany([
  user("Jane", "Doe", "jane.doe@example.com", {
    profile: { heightIn: 65, weightLb: 160, age: 20, sex: "female", activityLevel: "light", goal: "lose" },
  }),
  user("Kevin", "Nguyen", "kevin.nguyen@example.com", {
    profile: { heightIn: 70, weightLb: 155, age: 21, sex: "male", activityLevel: "active", goal: "gain" },
  }),
  user("Maria", "Lopez", "maria.lopez@example.com", {
    profile: { heightIn: 63, weightLb: 130, age: 22, sex: "female", activityLevel: "moderate", goal: "maintain" },
  }),
  user("Sam", "Patel", "sam.patel@example.com"),
  user("Alex", "Kim", "alex.kim@example.com", {
    isVerified: false,
    verificationTokenHash: "e88423eff51b27a761e50d04964225c3b7c2e5c8339dff83de0e0e63f1c93a72",
    verificationTokenExpires: inOneDay,
  }),
  user("Chris", "Brown", "chris.brown@example.com", {
    profile: { heightIn: 72, weightLb: 210, age: 24, sex: "male", activityLevel: "sedentary", goal: "lose" },
    resetTokenHash: "49aa6134750dec3a09830296a87a731a519d46688b6617e336fca4c6c1eebedf",
    resetTokenExpires: inOneHour,
  }),
]);
print(`users inserted: ${Object.keys(users.insertedIds).length}`);

// ---------------------------------------------------------------------------
// restaurants + menuItems
// ---------------------------------------------------------------------------
let itemCount = 0;
for (const r of UCF_CAMPUS_MENUS) {
  const { insertedId: restaurantId } = db.restaurants.insertOne({
    name: r.name,
    campusLocation: r.campusLocation,
    menuSourceUrl: r.menuSourceUrl,
    createdAt: now,
  });

  const items = r.items.map((item) => ({
    restaurantId,
    restaurantName: r.name,
    isEstimate: true,
    source: "sample value, not yet checked against " + r.menuSourceUrl,
    lastVerified: null,
    ...item,
  }));
  if (items.length > 0) {
    db.menuItems.insertMany(items);
    itemCount += items.length;
  }
}
print(`restaurants inserted: ${UCF_CAMPUS_MENUS.length}`);
print(`menuItems inserted: ${itemCount}`);
print("seed.js done");
