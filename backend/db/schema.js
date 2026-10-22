// schema.js  (mongosh script)
//
// Creates the MenuMacroFitter collections with validation rules and indexes.
// MongoDB has no CREATE TABLE, so the $jsonSchema validators below play the
// role schema.sql played in the small project: the database itself rejects
// documents that are missing required fields or have the wrong types.
//
// SAFE TO RE-RUN: existing collections get their validator updated (collMod)
// instead of being dropped, and createIndex is a no-op if the index exists.
//
// Run (from this folder):
//   mongosh "<connection string>" schema.js

db = db.getSiblingDB("MenuMacroFitter");

const number = { bsonType: ["int", "long", "double", "decimal"] };

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
      pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$",
      maxLength: 254,
      description: "stored lowercase; unique index below",
    },
    passwordHash: { bsonType: "string", description: "bcrypt hash, never the plain password" },
    isVerified: { bsonType: "bool", description: "false until the email link is clicked; login is refused while false" },
    verificationTokenHash: { bsonType: ["string", "null"], description: "SHA-256 of the emailed token" },
    verificationTokenExpires: { bsonType: ["date", "null"] },
    resetTokenHash: { bsonType: ["string", "null"], description: "SHA-256 of the password-reset token" },
    resetTokenExpires: { bsonType: ["date", "null"] },
    // Height and weight are always stored imperial; the API converts for
    // display when preferences.units is "metric".
    profile: {
      bsonType: ["object", "null"],
      required: ["heightIn", "weightLb", "birthDate", "sex", "activityLevel", "goal"],
      additionalProperties: false,
      properties: {
        heightIn: { ...number, minimum: 36, maximum: 96 },
        weightLb: { ...number, minimum: 50, maximum: 700 },
        birthDate: { bsonType: "date", description: "age is computed from this, never stored; must be 18+ (rule below)" },
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
        searchRadius: { enum: [5, 10, 15, 20], description: "miles; used once location filtering is built" },
        recommendationMode: { enum: ["protein", "carb"], description: "high-protein or high-carb ranking" },
        mealCalorieLimit: {
          bsonType: ["int", "long", "double", "decimal", "null"],
          minimum: 100,
          maximum: 3000,
          description: "per-meal limit the user set; null = use daily target / 3",
        },
      },
    },
    createdAt: { bsonType: "date" },
    updatedAt: { bsonType: "date" },
  },
};

// ---------------------------------------------------------------------------
// restaurants
// ---------------------------------------------------------------------------
// For now: fast-food places on the UCF campus. Location filtering by miles
// comes later (it will add a GeoJSON point + 2dsphere index here).
const restaurantsSchema = {
  bsonType: "object",
  required: ["name", "campusLocation", "menuSourceUrl", "createdAt"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    name: { bsonType: "string", minLength: 1, maxLength: 100 },
    campusLocation: { bsonType: "string", description: "building on campus, e.g. Student Union" },
    menuSourceUrl: { bsonType: "string", description: "public nutrition page the menu items were copied from" },
    createdAt: { bsonType: "date" },
  },
};

// ---------------------------------------------------------------------------
// menuItems
// ---------------------------------------------------------------------------
// Separate collection (REFERENCES restaurants by restaurantId) rather than an
// array inside each restaurant, so the search API can query and sort items
// across every restaurant in one query ("high-protein items under 600 cal").
// restaurantName is copied in (denormalized) so search results can show it
// without a $lookup on every keystroke.
const menuItemsSchema = {
  bsonType: "object",
  required: ["restaurantId", "restaurantName", "name", "category", "calories", "proteinG", "carbsG", "fatG", "isEstimate", "source"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "objectId" },
    restaurantId: { bsonType: "objectId" },
    restaurantName: { bsonType: "string" },
    name: { bsonType: "string", minLength: 1, maxLength: 150 },
    category: { enum: ["entree", "side", "breakfast", "salad", "drink", "dessert"] },
    calories: { ...number, minimum: 0 },
    proteinG: { ...number, minimum: 0 },
    carbsG: { ...number, minimum: 0 },
    fatG: { ...number, minimum: 0 },
    isEstimate: { bsonType: "bool", description: "true if not copied from an official nutrition page" },
    source: { bsonType: "string", description: "where the numbers came from" },
    lastVerified: { bsonType: ["date", "null"] },
  },
};

// ---------------------------------------------------------------------------
// Create or update each collection
// ---------------------------------------------------------------------------
function ensureCollection(name, schema, extraRules = {}) {
  const options = { validator: { $jsonSchema: schema, ...extraRules }, validationLevel: "strict", validationAction: "error" };
  if (db.getCollectionNames().includes(name)) {
    db.runCommand({ collMod: name, ...options });
    print(`updated validator: ${name}`);
  } else {
    db.createCollection(name, options);
    print(`created collection: ${name}`);
  }
}

// $jsonSchema can't compare against today's date, so the 18+ rule is an
// $expr next to it. A null profile passes (null sorts before any date).
const adultsOnly = {
  $expr: { $lte: ["$profile.birthDate", { $dateSubtract: { startDate: "$$NOW", unit: "year", amount: 18 } }] },
};

ensureCollection("users", usersSchema, adultsOnly);
ensureCollection("restaurants", restaurantsSchema);
ensureCollection("menuItems", menuItemsSchema);

// ---------------------------------------------------------------------------
// Indexes
// ---------------------------------------------------------------------------
db.users.createIndex({ email: 1 }, { unique: true, name: "email_unique" });
// Partial so this can be created on a database that still holds older users
// without a username; the validator requires username on every new write.
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

db.restaurants.createIndex({ name: 1, campusLocation: 1 }, { unique: true, name: "name_location_unique" });

db.menuItems.createIndex({ restaurantId: 1 }, { name: "by_restaurant" });
db.menuItems.createIndex({ restaurantId: 1, name: 1 }, { unique: true, name: "restaurant_item_unique" });
db.menuItems.createIndex({ calories: 1, proteinG: -1 }, { name: "calories_protein" });

print("schema.js done");
