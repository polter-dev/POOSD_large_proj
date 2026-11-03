// schema.js  (mongosh script)
//
// Creates the MenuMacroFitter collections with validation rules and indexes.
// MongoDB has no CREATE TABLE, so the $jsonSchema validators below play the
// role schema.sql played in the small project: the database itself rejects
// documents that are missing required fields or have the wrong types.
//
// SAFE TO RE-RUN: existing collections get their validator updated (collMod)
// instead of being dropped, and createIndex is a no-op if the index exists.
// Needs MongoDB 5.0+ ($dateSubtract in the users rule); check with db.version().
//
// Run (from this folder):
//   mongosh "<connection string>" schema.js

db = db.getSiblingDB("MenuMacroFitter");

const number = { bsonType: ["int", "long", "double", "decimal"] };
const numberOrNull = { bsonType: [...number.bsonType, "null"] };

// Chain names, alternate spellings and menu item search names are stored
// NORMALIZED (see normalize() in seed.js): lowercase, "&" -> "and",
// apostrophes dropped, every other non-letter/digit -> one space, trimmed.
//   "Chick-fil-A" -> "chick fil a"     "McDonald's" -> "mcdonalds"
// The API must normalize what it looks up (Places names, search text) the
// same way.
const normalized = { bsonType: "string", pattern: "^[a-z0-9]+( [a-z0-9]+)*$" };

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------
// One document per account. The fitness profile and preferences are EMBEDDED
// (not separate collections) because they are 1:1 with the user and always
// read with them. profile is null until the user fills it in after their
// first login; preferences get defaults at registration.
const usersSchema = {
  bsonType: "object",
  required: ["firstName", "lastName", "username", "email", "passwordHash", "isVerified", "preferences", "createdAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    firstName: { bsonType: "string", minLength: 1, maxLength: 50 },
    lastName: { bsonType: "string", minLength: 1, maxLength: 50 },
    username: {
      bsonType: "string",
      pattern: "^[a-z0-9_.]{3,30}$",
      description: "stored lowercase, 3-30 chars of a-z 0-9 _ . ; unique index below",
    },
    email: {
      bsonType: "string",
      pattern: "^[^@\\sA-Z]+@[^@\\sA-Z]+\\.[^@\\sA-Z]+$",
      maxLength: 254,
      description: "stored lowercase (uppercase is rejected so case can't dodge the unique index)",
    },
    passwordHash: { bsonType: "string", description: "bcrypt hash, never the plain password" },
    isVerified: { bsonType: "bool", description: "false until the email link is clicked; login is refused while false" },
    verificationTokenHash: { bsonType: ["string", "null"], description: "SHA-256 of the emailed token" },
    verificationTokenExpires: { bsonType: ["date", "null"] },
    resetTokenHash: { bsonType: ["string", "null"], description: "SHA-256 of the password-reset token" },
    resetTokenExpires: { bsonType: ["date", "null"] },
    // M6 (#107). Optional, so accounts from before it still pass strict validation. Missing = "user".
    // Never writable through the API: only scripts/make-admin.js sets it.
    role: { enum: ["user", "admin"], description: "admins can review community submissions" },
    // Height and weight are always stored imperial; the API converts for
    // display when preferences.units is "metric".
    profile: {
      bsonType: ["object", "null"],
      required: ["heightIn", "weightLb", "birthDate", "sex", "activityLevel", "goal"],
      additionalProperties: false,
      properties: {
        heightIn: { ...number, minimum: 36, maximum: 96 },
        weightLb: { ...number, minimum: 50, maximum: 700 },
        birthDate: { bsonType: "date", description: "age is computed from this, never stored; must be 18-120 (rule below)" },
        sex: { enum: ["male", "female"], description: "needed by the Mifflin-St Jeor formula" },
        activityLevel: { enum: ["sedentary", "light", "moderate", "active", "very_active"] },
        goal: { enum: ["lose", "maintain", "gain"] },
      },
    },
    preferences: {
      bsonType: "object",
      required: ["units", "searchRadius", "recommendationMode", "mealCalorieLimit"],
      additionalProperties: false,
      properties: {
        units: { enum: ["imperial", "metric"], description: "display units only" },
        searchRadius: { enum: [5, 10, 15, 20], description: "miles, for the nearby search" },
        recommendationMode: { enum: ["protein", "carb"], description: "high-protein or high-carb ranking" },
        mealCalorieLimit: {
          ...numberOrNull,
          minimum: 100,
          maximum: 3000,
          description: "per-meal limit the user set; null = use daily target / 3",
        },
        // M6 (#107): which totals the tracker shows. Optional (not in required); missing = ["calories", "protein"].
        trackedNutrients: {
          bsonType: "array",
          minItems: 1,
          maxItems: 4,
          uniqueItems: true,
          items: { enum: ["calories", "protein", "carbs", "fat"] },
        },
      },
    },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

// $jsonSchema can't compare against today's date, so the age rule is an $expr
// next to it: 18 or older (spec), and at most 120 so a typo like 1826 can't
// produce a negative calorie target. A null profile skips the check.
const ageRule = {
  $expr: {
    $or: [
      { $eq: [{ $ifNull: ["$profile", null] }, null] },
      {
        $and: [
          { $lte: ["$profile.birthDate", { $dateSubtract: { startDate: "$$NOW", unit: "year", amount: 18 } }] },
          { $gte: ["$profile.birthDate", { $dateSubtract: { startDate: "$$NOW", unit: "year", amount: 120 } }] },
        ],
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// chains
// ---------------------------------------------------------------------------
// A restaurant BRAND (Chick-fil-A), not a location. Locations come live from
// the Places API (#30) and are never stored; the API matches each Places
// result to a chain by nameKey or alternateNames. Whether a chain "has
// nutrition data" is computed from menuItems, not stored.
const chainsSchema = {
  bsonType: "object",
  required: ["name", "nameKey", "alternateNames", "nutritionSourceUrl", "createdAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    name: { bsonType: "string", minLength: 1, maxLength: 100, description: "display name, e.g. Chick-fil-A" },
    nameKey: { ...normalized, description: "normalized name; unique index below" },
    alternateNames: {
      bsonType: "array",
      uniqueItems: true,
      items: normalized,
      description: "other normalized spellings Places may return, e.g. chickfila",
    },
    nutritionSourceUrl: {
      bsonType: "string",
      pattern: "^https://",
      description: "the chain's official nutrition page; menu items are checked against it",
    },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

// ---------------------------------------------------------------------------
// menuItems
// ---------------------------------------------------------------------------
// Separate collection (REFERENCES chains by chainId) rather than an array
// inside each chain, so the search API can query and sort items across every
// chain in one query ("high-protein items under 600 cal"). chainName is
// copied in (denormalized) so results can show it without a $lookup.
//
// Unknown macros are stored as null, NEVER 0 (#28): a 0 would be ranked as a
// real value. Calories can't be null; chains are required to publish them.
const menuItemsSchema = {
  bsonType: "object",
  required: ["chainId", "chainName", "name", "searchName", "category", "calories", "proteinG", "carbsG", "fatG", "isEstimate", "source", "lastVerified"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    chainId: { bsonType: "objectId", description: "chains._id" },
    chainName: { bsonType: "string", description: "copy of chains.name" },
    name: { bsonType: "string", minLength: 1, maxLength: 150 },
    searchName: { ...normalized, description: "normalized name for partial-match search (index below)" },
    category: { enum: ["entree", "side", "breakfast", "salad", "drink", "dessert"] },
    calories: { ...number, minimum: 0, maximum: 5000 },
    proteinG: { ...numberOrNull, minimum: 0 },
    carbsG: { ...numberOrNull, minimum: 0 },
    fatG: { ...numberOrNull, minimum: 0 },
    isEstimate: { bsonType: "bool", description: "false only once checked against the chain's official page" },
    source: { bsonType: "string", minLength: 1, description: "where the numbers came from" },
    lastVerified: { bsonType: ["date", "null"], description: "when someone checked the official page" },
  },
};

// A verified item must say when it was verified (#28: verified only counts
// when checked against the official page).
const verifiedNeedsDate = {
  $expr: { $or: [{ $eq: ["$isEstimate", true] }, { $eq: [{ $type: "$lastVerified" }, "date"] }] },
};

// ---------------------------------------------------------------------------
// favorites
// ---------------------------------------------------------------------------
// A saved restaurant LOCATION. Spec N4: store only the user, the place ID from
// the nearby search (osm-node-123...) and an optional label (no address, no
// coordinates, no user location).
// additionalProperties: false makes the database enforce that.
const favoritesSchema = {
  bsonType: "object",
  required: ["userId", "placeId", "label", "createdAt"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    userId: { bsonType: "objectId", description: "users._id" },
    placeId: { bsonType: "string", pattern: "^[A-Za-z0-9_-]{10,300}$", description: "placeId from POST /restaurants/nearby, e.g. osm-node-1234567890" },
    label: { bsonType: ["string", "null"], minLength: 1, maxLength: 50, description: "optional, e.g. Union Chick-fil-A" },
    createdAt: { bsonType: "date" },
  },
};

// ---------------------------------------------------------------------------
// mealLogs (M6, #107; shapes from #106 §A)
// ---------------------------------------------------------------------------
// One food a user ate or plans to eat on a day. A SNAPSHOT: name, chain and
// macros are copied in (from the menu item when menuItemId is set), so the
// log stays right if the item is later edited or deleted. menuItemId may
// therefore point at an item that no longer exists. Macros are for ONE
// serving; totals multiply by servings. Unknown macros are null, never 0.
const date = { bsonType: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" };
const mealLogsSchema = {
  bsonType: "object",
  required: ["userId", "date", "status", "menuItemId", "name", "chainName", "servings", "calories", "proteinG", "carbsG", "fatG", "source", "createdAt"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    userId: { bsonType: "objectId", description: "users._id" },
    // The user's own calendar day, sent by the client; the server never converts time zones.
    // The pattern can't reject 2026-02-30, so the API checks for a real date.
    date: { ...date, description: "YYYY-MM-DD in the user's time zone" },
    status: { enum: ["planned", "eaten"] },
    menuItemId: { bsonType: ["objectId", "null"], description: "menuItems._id, or null for custom food" },
    name: { bsonType: "string", minLength: 1, maxLength: 150 },
    chainName: { bsonType: ["string", "null"], minLength: 1, maxLength: 100 },
    servings: { ...number, minimum: 0.25, maximum: 10 },
    calories: { ...number, minimum: 0, maximum: 5000 },
    proteinG: { ...numberOrNull, minimum: 0 },
    carbsG: { ...numberOrNull, minimum: 0 },
    fatG: { ...numberOrNull, minimum: 0 },
    source: { enum: ["search", "plan", "photo", "custom"], description: "where the entry came from" },
    createdAt: { bsonType: "date" },
  },
};

// ---------------------------------------------------------------------------
// submissions (M6, #107; shapes from #106 §A)
// ---------------------------------------------------------------------------
// A community edit: fix a menu item, add one, or add a restaurant. Auto-
// moderation either applies it at once (auto_applied) or queues it (pending)
// for an admin. payload is the change itself; its shape depends on kind and
// is checked by the API, so here it only has to be an object. before holds
// what an applied edit replaced, so it can be reverted.
const FLAGS = ["new_chain", "verified_item", "renamed", "large_change", "macros_mismatch", "new_account", "untrusted_user", "url_in_name"];
const submissionsSchema = {
  bsonType: "object",
  required: ["userId", "kind", "targetId", "payload", "before", "resultId", "status", "flags", "reviewedBy", "reviewNote", "createdAt", "updatedAt"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    userId: { bsonType: "objectId", description: "users._id of the author" },
    kind: { enum: ["edit_item", "new_item", "new_chain"] },
    targetId: { bsonType: ["objectId", "null"], description: "menu item (edit_item) or chain (new_item); null for new_chain" },
    payload: { bsonType: "object" },
    before: { bsonType: ["object", "null"], description: "previous values of what an applied edit changed" },
    resultId: { bsonType: ["objectId", "null"], description: "the menu item or chain a new_item/new_chain created" },
    status: { enum: ["auto_applied", "pending", "approved", "rejected", "reverted"] },
    flags: { bsonType: "array", uniqueItems: true, items: { enum: FLAGS }, description: "why it needs review; empty = auto_applied" },
    reviewedBy: { bsonType: ["objectId", "null"], description: "users._id of the admin who last changed its status" },
    reviewNote: { bsonType: ["string", "null"], minLength: 1, maxLength: 300 },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

// new_chain has no target; the other kinds always point at something.
const targetMatchesKind = {
  $expr: { $eq: [{ $eq: ["$kind", "new_chain"] }, { $eq: [{ $type: "$targetId" }, "null"] }] },
};

// ---------------------------------------------------------------------------
// Create or update each collection
// ---------------------------------------------------------------------------
function ensureCollection(name, schema, extraRules = {}) {
  const options = { validator: { $jsonSchema: schema, ...extraRules }, validationLevel: "strict", validationAction: "error" };
  // runCommand returns { ok: 0 } instead of throwing, so check it; otherwise a
  // rejected validator would silently leave the old one in place.
  const exists = db.getCollectionNames().includes(name);
  const res = exists ? db.runCommand({ collMod: name, ...options }) : db.runCommand({ create: name, ...options });
  if (!res.ok) throw new Error(`${exists ? "collMod" : "create"} ${name} failed: ${res.errmsg}`);
  print(`${exists ? "updated validator" : "created collection"}: ${name}`);
}

// Old design (before #29): menu items pointed at a campus "restaurants"
// collection. Drop it and the menu items that referenced it (their old
// indexes would clash); seed.js reloads menu items against chains.
if (db.getCollectionNames().includes("restaurants")) {
  db.restaurants.drop();
  db.menuItems.drop();
  print("dropped old collections: restaurants, menuItems");
}

ensureCollection("users", usersSchema, ageRule);
ensureCollection("chains", chainsSchema);
ensureCollection("menuItems", menuItemsSchema, verifiedNeedsDate);
ensureCollection("favorites", favoritesSchema);
ensureCollection("mealLogs", mealLogsSchema);
ensureCollection("submissions", submissionsSchema, targetMatchesKind);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
db.users.createIndex({ email: 1 }, { unique: true, name: "email_unique" });
// Kept partial (as first deployed): changing an index's options under the
// same name makes createIndex fail on the existing server.
db.users.createIndex(
  { username: 1 },
  { unique: true, name: "username_unique", partialFilterExpression: { username: { $type: "string" } } }
);
// Partial indexes: only users with a pending token are indexed, so the
// verify-email / reset-password lookups are fast without indexing everyone.
db.users.createIndex(
  { verificationTokenHash: 1 },
  { name: "verification_token", partialFilterExpression: { verificationTokenHash: { $type: "string" } } }
);
db.users.createIndex(
  { resetTokenHash: 1 },
  { name: "reset_token", partialFilterExpression: { resetTokenHash: { $type: "string" } } }
);

// Nearby search (#30) matches a Places name with { nameKey: k } or
// { alternateNames: k }; both are index lookups.
db.chains.createIndex({ nameKey: 1 }, { unique: true, name: "name_key_unique" });
db.chains.createIndex({ alternateNames: 1 }, { name: "alternate_names" });

db.menuItems.createIndex({ chainId: 1, searchName: 1 }, { unique: true, name: "chain_item_unique" });
// Search (#31): a regex on the normalized searchName scans this small index
// instead of every document, and a "^prefix" regex gets tight index bounds.
db.menuItems.createIndex({ searchName: 1 }, { name: "search_name" });
// Recommendations (#32): "under N calories", ranked by protein or by carbs.
db.menuItems.createIndex({ calories: 1, proteinG: -1 }, { name: "calories_protein" });
db.menuItems.createIndex({ calories: 1, carbsG: -1 }, { name: "calories_carbs" });

// One favorite per place per user; the userId prefix also serves "my favorites".
db.favorites.createIndex({ userId: 1, placeId: 1 }, { unique: true, name: "user_place_unique" });

// Tracker (#108): one user's entries for a date range, already in date order.
db.mealLogs.createIndex({ userId: 1, date: 1 }, { name: "user_date" });
// Admin queue (#109): pending (or any status), newest or oldest first.
db.submissions.createIndex({ status: 1, createdAt: -1 }, { name: "status_created" });
// "My submissions" and the 10-per-24-hours limit (#110).
db.submissions.createIndex({ userId: 1, createdAt: -1 }, { name: "user_created" });

print("schema.js done");
