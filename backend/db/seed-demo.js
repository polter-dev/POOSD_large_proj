// seed-demo.js  (mongosh script, #169)
//
// Adds the presentation's demo accounts to a database that already has real
// users. Unlike seed.js it deletes nothing else: it upserts three users by
// username, replaces only demouser's own favorites, meal logs and submissions,
// and resets the one community menu item it owns ("Grilled Cool Wrap" at
// Chick-fil-A). Run it AFTER schema.js and seed.js (it needs the seeded
// chains and menu items), from this folder:
//   mongosh --quiet "<connection string>" seed-demo.js
// SAFE TO RE-RUN: a second run leaves the same documents. Meal logs are dated
// to the day it runs (UCF's time zone), so re-run it shortly before the demo.
//
// ACCOUNTS (password for all three: Password123!, same hash as seed.js)
//   demoadmin    demoadmin@example.com    the review queue, once it is made an admin (below)
//   demouser     demouser@example.com     favorites, today's meal logs, one submission in each state
//   swaggerdemo  swaggerdemo@example.com  profile only, for SwaggerHub "Try it out"
// demoadmin has no role until you run `node scripts/make-admin.js demoadmin` on the server;
// revoke with `--revoke` after the demo. Its password is public, so this script never grants
// or removes the role: a re-run leaves whatever make-admin.js set.

db = db.getSiblingDB("MenuMacroFitter");

const PASSWORD_HASH = "$2b$10$fYkTDYUE26dcsyJDdm8T2.ePWbXs35ePgSzevHC1y6fEpOm85Py/u";
const now = new Date();
const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
const hoursAgo = (h) => new Date(now.getTime() - h * 60 * 60 * 1000);
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);

// ---------------------------------------------------------------------------
// Read the seed data first: if seed.js has not run, throw before writing anything
// ---------------------------------------------------------------------------
function fromItem(chainName, name, extra) {
  const m = db.menuItems.findOne({ chainName, name });
  if (!m) throw new Error(`seed-demo.js: no menu item "${name}" at ${chainName}; run seed.js first`);
  return { menuItemId: m._id, name: m.name, chainName: m.chainName, calories: m.calories, proteinG: m.proteinG, carbsG: m.carbsG, fatG: m.fatG, servings: 1, ...extra };
}
const mealLogEntries = [
  fromItem("Starbucks", "Spinach, Feta & Egg White Wrap", { status: "eaten", source: "search" }),
  fromItem("Chick-fil-A", "Grilled Nuggets (8 ct)", { status: "eaten", source: "photo" }),
  { menuItemId: null, name: "Protein shake", chainName: null, servings: 1, calories: 160, proteinG: 30, carbsG: 5, fatG: 2, status: "eaten", source: "custom" },
  fromItem("Chipotle", "Chicken Burrito Bowl (white rice, black beans, chicken)", { status: "planned", source: "plan" }),
  fromItem("Panda Express", "Grilled Teriyaki Chicken", { status: "planned", servings: 1.5, source: "plan" }),
];
const cfa = db.chains.findOne({ nameKey: "chick fil a" });
if (!cfa) throw new Error("seed-demo.js: no Chick-fil-A chain; run seed.js first");

// ---------------------------------------------------------------------------
// users: upserted, so a re-run resets the password and profile (never demoadmin's role)
// ---------------------------------------------------------------------------
const DEFAULT_PREFERENCES = { units: "imperial", searchRadius: 5, recommendationMode: "protein", mealCalorieLimit: null };

function upsertUser(firstName, lastName, username, extra) {
  db.users.updateOne(
    { username },
    {
      $set: {
        firstName, lastName, username, email: `${username}@example.com`, passwordHash: PASSWORD_HASH, isVerified: true,
        verificationTokenHash: null, verificationTokenExpires: null, resetTokenHash: null, resetTokenExpires: null,
        preferences: DEFAULT_PREFERENCES, createdAt: monthAgo, updatedAt: now, ...extra,
      },
    },
    { upsert: true },
  );
  return db.users.findOne({ username }, { _id: 1 })._id;
}

const adminId = upsertUser("Demo", "Admin", "demoadmin", {
  profile: { heightIn: 68, weightLb: 170, birthDate: new Date("2003-04-21"), sex: "male", activityLevel: "moderate", goal: "maintain" },
});
const demoId = upsertUser("Demo", "User", "demouser", {
  role: "user",
  profile: { heightIn: 66, weightLb: 150, birthDate: new Date("2005-08-09"), sex: "female", activityLevel: "active", goal: "lose" },
  preferences: { ...DEFAULT_PREFERENCES, trackedNutrients: ["calories", "protein", "carbs", "fat"] },
});
upsertUser("Swagger", "Demo", "swaggerdemo", {
  role: "user",
  profile: { heightIn: 70, weightLb: 180, birthDate: new Date("2001-11-02"), sex: "male", activityLevel: "light", goal: "gain" },
});

// Replace only demouser's own rows.
db.favorites.deleteMany({ userId: demoId });
db.mealLogs.deleteMany({ userId: demoId });
db.submissions.deleteMany({ userId: demoId });

// ---------------------------------------------------------------------------
// favorites: real OpenStreetMap places near UCF (from places-snapshot.json)
// ---------------------------------------------------------------------------
const favorites = db.favorites.insertMany([
  { userId: demoId, placeId: "osm-node-462947213", label: "Union Chick-fil-A", createdAt: hoursAgo(48) },
  { userId: demoId, placeId: "osm-node-8554618395", label: "Morning coffee", createdAt: hoursAgo(30) },
  { userId: demoId, placeId: "osm-node-12644371401", label: null, createdAt: hoursAgo(6) },
]);

// ---------------------------------------------------------------------------
// mealLogs: today, eaten and planned, snapshots of seeded items like the API makes
// ---------------------------------------------------------------------------
const mealLogs = db.mealLogs.insertMany(mealLogEntries.map((e) => ({ userId: demoId, date: today, createdAt: now, ...e })));

// ---------------------------------------------------------------------------
// submissions: one in each state demouser's screen and the admin queue show
// ---------------------------------------------------------------------------
// All of them act on one community item this script owns, so no seeded item is
// changed. Its state is set the same way every run: the approved new_item's
// values plus the auto-applied carbs fix. Found by chain + searchName, never duplicated.
const COMMUNITY = { isEstimate: true, source: "community", lastVerified: null };
const wrap = { name: "Grilled Cool Wrap", category: "entree", calories: 350, proteinG: 42, carbsG: 29, fatG: 13 };
const carbsFix = { carbsG: 32 };
db.menuItems.updateOne(
  { chainId: cfa._id, searchName: "grilled cool wrap" },
  { $set: { chainId: cfa._id, chainName: cfa.name, searchName: "grilled cool wrap", ...wrap, ...carbsFix, ...COMMUNITY } },
  { upsert: true },
);
const wrapId = db.menuItems.findOne({ chainId: cfa._id, searchName: "grilled cool wrap" }, { _id: 1 })._id;

const submissions = db.submissions.insertMany([
  // Added on the account's first day (new_account), so it waited for an admin, who approved it.
  {
    userId: demoId, kind: "new_item", targetId: cfa._id, payload: wrap, before: null, resultId: wrapId,
    status: "approved", flags: ["new_account"], reviewedBy: adminId, reviewNote: "Matches the chain's menu; added as a community estimate.",
    createdAt: new Date(monthAgo.getTime() + 2 * 60 * 60 * 1000), updatedAt: new Date(monthAgo.getTime() + 26 * 60 * 60 * 1000),
  },
  {
    userId: demoId, kind: "new_chain", targetId: null,
    payload: { name: "Knight Bites Food Truck", nutritionSourceUrl: "https://example.com/knight-bites-menu" }, before: null, resultId: null,
    status: "rejected", flags: ["new_chain"], reviewedBy: adminId, reviewNote: "Local food truck with no published nutrition page.",
    createdAt: hoursAgo(72), updatedAt: hoursAgo(48),
  },
  // No flags, so it applied at once; before is what moderation.apply stores (the hidden fields included).
  {
    userId: demoId, kind: "edit_item", targetId: wrapId, payload: carbsFix, before: { carbsG: wrap.carbsG, ...COMMUNITY }, resultId: null,
    status: "auto_applied", flags: [], reviewedBy: null, reviewNote: null, createdAt: hoursAgo(20), updatedAt: hoursAgo(20),
  },
  // 350 -> 520 kcal is over 30% (large_change) and no longer fits the macros (macros_mismatch): the admin's live review.
  {
    userId: demoId, kind: "edit_item", targetId: wrapId, payload: { calories: 520 }, before: null, resultId: null,
    status: "pending", flags: ["large_change", "macros_mismatch"], reviewedBy: null, reviewNote: null, createdAt: hoursAgo(2), updatedAt: hoursAgo(2),
  },
]);

print(`seed-demo.js done: 3 demo users; demouser has ${Object.keys(favorites.insertedIds).length} favorites, ` +
  `${Object.keys(mealLogs.insertedIds).length} meal logs for ${today}, ${Object.keys(submissions.insertedIds).length} submissions`);
