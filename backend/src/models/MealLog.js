const mongoose = require("mongoose");

const { ObjectId } = mongoose.Schema.Types;

// Mirrors the mealLogs $jsonSchema in db/schema.js (M6, #107): a snapshot of one food on the user's local day.
// Macros are for one serving; null = unknown. menuItemId is null for custom food, and may point at an item
// that no longer exists.
const mealLogSchema = new mongoose.Schema(
  {
    userId: ObjectId,
    date: String, // YYYY-MM-DD, the user's own calendar day
    status: { type: String, enum: ["planned", "eaten"] },
    menuItemId: { type: ObjectId, default: null },
    name: String,
    chainName: { type: String, default: null },
    servings: Number,
    calories: Number,
    proteinG: Number,
    carbsG: Number,
    fatG: Number,
    source: { type: String, enum: ["search", "plan", "photo", "custom"] },
  },
  { collection: "mealLogs", versionKey: false, timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("MealLog", mealLogSchema);
