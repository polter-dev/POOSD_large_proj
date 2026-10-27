// seed.js  (mongosh script)
//
// Fills MenuMacroFitter with test users, restaurant chains, their menu items,
// and a few favorites, so developers and the demo have data to query.
//
// SAFE TO RE-RUN: deletes existing documents first, so running it twice does
// not create duplicates. Run it AFTER schema.js, from this folder:
//   mongosh "<connection string>" schema.js seed.js
//
// TEST ACCOUNTS (plain-text password below is for testing only -- never do
// this with real user data). Every account's password is: Password123!
//   username   email                     state
//   janedoe    jane.doe@example.com      verified, full profile (lose, carb mode), 2 favorites
//   kevinn     kevin.nguyen@example.com  verified, full profile (gain, protein mode), 1 favorite
//   marial     maria.lopez@example.com   verified, full profile (maintain, metric units)
//   sampatel   sam.patel@example.com     verified, profile null (just registered)
//   alexkim    alex.kim@example.com      NOT verified -- login must be refused
//   chrisb     chris.brown@example.com   verified, password reset pending, 600-cal meal limit
//
// The hash below was generated with bcryptjs:
//   node -e "console.log(require('bcryptjs').hashSync('Password123!', 10))"
// so the backend's bcrypt.compare() will accept "Password123!" for every account.
//
// Token hashes are SHA-256 of the raw tokens "demo-verify-token" and
// "demo-reset-token" (the raw token is what the email link would contain).

db = db.getSiblingDB("MenuMacroFitter");
load(__dirname + "/menu-data/chains.js"); // defines CHAINS; __dirname so seed.js runs from any folder

const PASSWORD_HASH = "$2b$10$fYkTDYUE26dcsyJDdm8T2.ePWbXs35ePgSzevHC1y6fEpOm85Py/u";
const now = new Date();
const inOneDay = new Date(now.getTime() + 24 * 60 * 60 * 1000);
const inOneHour = new Date(now.getTime() + 60 * 60 * 1000);

// The one normalize rule (see schema.js); the API must use the same one for
// Places names and search text.
function normalize(s) {
  return s
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // Caffè -> Caffe
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Clear existing data first (children before parents).
db.favorites.deleteMany({});
db.menuItems.deleteMany({});
db.chains.deleteMany({});
db.users.deleteMany({});

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
// Defaults the API gives every new account at registration.
const DEFAULT_PREFERENCES = { units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null };

function user(firstName, lastName, username, email, extra) {
  return {
    firstName,
    lastName,
    username,
    email,
    passwordHash: PASSWORD_HASH,
    isVerified: true,
    verificationTokenHash: null,
    verificationTokenExpires: null,
    resetTokenHash: null,
    resetTokenExpires: null,
    profile: null,
    preferences: DEFAULT_PREFERENCES,
    createdAt: now,
    updatedAt: now,
    ...extra,
  };
}

const users = db.users.insertMany([
  user("Jane", "Doe", "janedoe", "jane.doe@example.com", {
    profile: { heightIn: 65, weightLb: 160, birthDate: new Date("2006-03-14"), sex: "female", activityLevel: "light", goal: "lose" },
    preferences: { ...DEFAULT_PREFERENCES, recommendationMode: "carb" },
  }),
  user("Kevin", "Nguyen", "kevinn", "kevin.nguyen@example.com", {
    profile: { heightIn: 70, weightLb: 155, birthDate: new Date("2005-06-02"), sex: "male", activityLevel: "active", goal: "gain" },
    preferences: { ...DEFAULT_PREFERENCES, searchRadius: 10 },
  }),
  user("Maria", "Lopez", "marial", "maria.lopez@example.com", {
    profile: { heightIn: 63, weightLb: 130, birthDate: new Date("2004-09-30"), sex: "female", activityLevel: "moderate", goal: "maintain" },
    preferences: { ...DEFAULT_PREFERENCES, units: "metric" },
  }),
  user("Sam", "Patel", "sampatel", "sam.patel@example.com"),
  user("Alex", "Kim", "alexkim", "alex.kim@example.com", {
    isVerified: false,
    verificationTokenHash: "e88423eff51b27a761e50d04964225c3b7c2e5c8339dff83de0e0e63f1c93a72",
    verificationTokenExpires: inOneDay,
  }),
  user("Chris", "Brown", "chrisb", "chris.brown@example.com", {
    profile: { heightIn: 72, weightLb: 210, birthDate: new Date("2002-01-15"), sex: "male", activityLevel: "sedentary", goal: "lose" },
    preferences: { ...DEFAULT_PREFERENCES, mealCalorieLimit: 600 },
    resetTokenHash: "49aa6134750dec3a09830296a87a731a519d46688b6617e336fca4c6c1eebedf",
    resetTokenExpires: inOneHour,
  }),
]);
print(`users inserted: ${Object.keys(users.insertedIds).length}`);

// ---------------------------------------------------------------------------
// chains + menuItems
// ---------------------------------------------------------------------------
let itemCount = 0;
for (const c of CHAINS) {
  const nameKey = normalize(c.name);
  const { insertedId: chainId } = db.chains.insertOne({
    name: c.name,
    nameKey,
    // The chain's own name is matched by nameKey, so leave it out here.
    alternateNames: [...new Set(c.alternateNames.map(normalize))].filter((n) => n !== nameKey),
    nutritionSourceUrl: c.nutritionSourceUrl,
    createdAt: now,
    updatedAt: now,
  });

  const items = c.items.map((item) => ({
    chainId,
    chainName: c.name,
    searchName: normalize(item.name),
    isEstimate: true,
    source: "draft value, not yet checked against " + c.nutritionSourceUrl,
    lastVerified: null,
    ...item, // a verified item overrides isEstimate / source / lastVerified
  }));
  if (items.length > 0) {
    db.menuItems.insertMany(items);
    itemCount += items.length;
  }
}
print(`chains inserted: ${CHAINS.length}`);
print(`menuItems inserted: ${itemCount}`);

// ---------------------------------------------------------------------------
// favorites
// ---------------------------------------------------------------------------
// Place IDs are made-up placeholders in Google's format; real ones come from
// the Places API once #27 picks a provider.
const userId = (username) => db.users.findOne({ username }, { _id: 1 })._id;
const favorites = db.favorites.insertMany([
  { userId: userId("janedoe"), placeId: "ChIJdemo_ChickfilA_StudentUnion", label: "Union Chick-fil-A", createdAt: now },
  { userId: userId("janedoe"), placeId: "ChIJdemo_Chipotle_UniversityBlvd", label: null, createdAt: now },
  { userId: userId("kevinn"), placeId: "ChIJdemo_ChickfilA_StudentUnion", label: "Post-gym", createdAt: now },
]);
print(`favorites inserted: ${Object.keys(favorites.insertedIds).length}`);
print("seed.js done");
