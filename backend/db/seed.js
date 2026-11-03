// seed.js  (mongosh script)
//
// Fills MenuMacroFitter with test users, restaurant chains, their menu items,
// favorites, meal logs and community submissions, so developers and the demo
// have data to query.
//
// SAFE TO RE-RUN: deletes existing documents first, so running it twice does
// not create duplicates. Run it AFTER schema.js, from this folder:
//   mongosh "<connection string>" schema.js seed.js
// Meal-log dates are relative to the day it runs (UCF's time zone), so re-run
// it on the morning of a demo.
//
// TEST ACCOUNTS (plain-text password below is for testing only -- never do
// this with real user data). Every account's password is: Password123!
//   username   email                     state
//   janedoe    jane.doe@example.com      verified, full profile (lose, carb mode), 2 favorites, meal logs
//   kevinn     kevin.nguyen@example.com  verified, full profile (gain, protein mode), 1 favorite, 1 pending submission
//   marial     maria.lopez@example.com   verified, full profile (maintain, metric units), 1 auto-applied submission
//   sampatel   sam.patel@example.com     verified, profile null (just registered)
//   alexkim    alex.kim@example.com      NOT verified -- login must be refused
//   chrisb     chris.brown@example.com   verified, password reset pending, 600-cal meal limit
//
// ADMIN (M6, #107): only with SEED_ADMIN=1, for local and CI databases:
//   SEED_ADMIN=1 mongosh "<connection string>" schema.js seed.js
//   siteadmin  admin@example.com         verified, role "admin", profile null
// Never on production: this file and its password are public, so a seeded
// admin there would let anyone review submissions. Production admins come
// from scripts/make-admin.js on a teammate's own account.
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
// Seed accounts are a month old, so auto-moderation (#110) doesn't flag their
// submissions as coming from a brand-new account.
const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000);
// mealLogs.date is the user's own calendar day; the demo users are at UCF.
const ucfDay = (daysBack) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000));

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
db.submissions.deleteMany({});
db.mealLogs.deleteMany({});
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
    createdAt: monthAgo,
    updatedAt: now,
    ...extra,
  };
}

// role and trackedNutrients are left out on purpose for most accounts: they're
// optional, and accounts made before M6 don't have them.
const users = db.users.insertMany([
  user("Jane", "Doe", "janedoe", "jane.doe@example.com", {
    profile: { heightIn: 65, weightLb: 160, birthDate: new Date("2006-03-14"), sex: "female", activityLevel: "light", goal: "lose" },
    preferences: { ...DEFAULT_PREFERENCES, recommendationMode: "carb", trackedNutrients: ["calories", "protein", "carbs"] },
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
  // Opt-in only (see the top of this file): never seed a known admin password into production.
  ...(process.env.SEED_ADMIN === "1" ? [user("Site", "Admin", "siteadmin", "admin@example.com", { role: "admin" })] : []),
]);
print(`users inserted: ${Object.keys(users.insertedIds).length}${process.env.SEED_ADMIN === "1" ? " (including siteadmin)" : ""}`);

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
// Place IDs are made-up placeholders. Real ones come from the nearby search
// (OpenStreetMap, #27) and look like osm-node-1234567890.
const userId = (username) => db.users.findOne({ username }, { _id: 1 })._id;
const favorites = db.favorites.insertMany([
  { userId: userId("janedoe"), placeId: "ChIJdemo_ChickfilA_StudentUnion", label: "Union Chick-fil-A", createdAt: now },
  { userId: userId("janedoe"), placeId: "ChIJdemo_Chipotle_UniversityBlvd", label: null, createdAt: now },
  { userId: userId("kevinn"), placeId: "ChIJdemo_ChickfilA_StudentUnion", label: "Post-gym", createdAt: now },
]);
print(`favorites inserted: ${Object.keys(favorites.insertedIds).length}`);

// ---------------------------------------------------------------------------
// mealLogs (M6): janedoe's tracker, yesterday and today
// ---------------------------------------------------------------------------
// From a menu item the name, chain and macros are copied in, like the API
// does; the log is a snapshot that survives later edits to the item.
function fromItem(chainName, name, extra) {
  const m = db.menuItems.findOne({ chainName, name });
  if (!m) throw new Error(`seed.js: no menu item "${name}" at ${chainName}`);
  return { menuItemId: m._id, name: m.name, chainName: m.chainName, calories: m.calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG, servings: 1, ...extra };
}
const jane = userId("janedoe");
const yesterday = ucfDay(1);
const today = ucfDay(0);
const mealLogs = db.mealLogs.insertMany(
  [
    fromItem("Starbucks", "Spinach, Feta & Egg White Wrap", { date: yesterday, status: "eaten", source: "search", createdAt: hoursAgo(34) }),
    fromItem("Chipotle", "Chicken Burrito Bowl (white rice, black beans, chicken)", { date: yesterday, status: "eaten", source: "plan", createdAt: hoursAgo(29) }),
    // Custom food: no menu item, and the fat isn't known, so the day's totals are "at least" (incomplete).
    { menuItemId: null, name: "Homemade smoothie", chainName: null, servings: 1, calories: 250, proteinG: 8, carbsG: 45, fatG: null, date: yesterday, status: "eaten", source: "custom", createdAt: hoursAgo(26) },
    fromItem("Panda Express", "Grilled Teriyaki Chicken", { date: yesterday, status: "eaten", servings: 1.5, source: "search", createdAt: hoursAgo(22) }),
    fromItem("Chick-fil-A", "Grilled Nuggets (8 ct)", { date: today, status: "eaten", source: "photo", createdAt: hoursAgo(3) }),
    fromItem("Subway", "6-inch Grilled Chicken (Fresh Fit)", { date: today, status: "planned", source: "plan", createdAt: hoursAgo(2) }),
  ].map((e) => ({ userId: jane, ...e })),
);
print(`mealLogs inserted: ${Object.keys(mealLogs.insertedIds).length}`);

// ---------------------------------------------------------------------------
// submissions (M6): one auto-applied, one waiting for an admin
// ---------------------------------------------------------------------------
// marial added an item Subway lists on its own nutrition PDF but we didn't
// load. No flags, so it went live at once, as a community estimate: hidden
// from recommendations (R4) until someone verifies it.
const subway = db.chains.findOne({ nameKey: "subway" });
const veggie = { name: "6-inch Veggie Delite", category: "entree", calories: 310, proteinG: 16, carbsG: 40, fatG: 10 };
const { insertedId: veggieId } = db.menuItems.insertOne({
  chainId: subway._id, chainName: subway.name, searchName: normalize(veggie.name), ...veggie,
  isEstimate: true, source: "community", lastVerified: null,
});
// kevinn suggested a new calorie count for a verified item: flagged, so it waits.
const bigMac = db.menuItems.findOne({ chainName: "McDonald's", name: "Big Mac" });
const submissions = db.submissions.insertMany([
  {
    userId: userId("marial"), kind: "new_item", targetId: subway._id, payload: veggie, before: null, resultId: veggieId,
    status: "auto_applied", flags: [], reviewedBy: null, reviewNote: null, createdAt: hoursAgo(20), updatedAt: hoursAgo(20),
  },
  {
    userId: userId("kevinn"), kind: "edit_item", targetId: bigMac._id, payload: { calories: 600 }, before: null, resultId: null,
    status: "pending", flags: ["verified_item"], reviewedBy: null, reviewNote: null, createdAt: hoursAgo(5), updatedAt: hoursAgo(5),
  },
]);
print(`submissions inserted: ${Object.keys(submissions.insertedIds).length}`);
print("seed.js done");
