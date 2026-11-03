const mongoose = require("mongoose");

// Minimal model so GET /meal-plans can read logs; #108 owns it (meal-log endpoints) and may extend it.
// Mirrors the mealLogs $jsonSchema in db/schema.js: a snapshot of one food on the user's local day.
const mealLogSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    date: String,
    status: String,
    menuItemId: mongoose.Schema.Types.ObjectId,
    name: String,
    chainName: String,
    servings: Number,
    calories: Number,
    proteinG: Number,
    carbsG: Number,
    fatG: Number,
    source: String,
  },
  { collection: "mealLogs", versionKey: false, timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("MealLog", mealLogSchema);
