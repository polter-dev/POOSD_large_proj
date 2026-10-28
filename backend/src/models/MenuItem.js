const mongoose = require("mongoose");

// Read-only here: menu items are loaded by db/seed.js, and the collection's $jsonSchema validator owns the rules.
// timestamps: false because the validator has no createdAt/updatedAt.
const menuItemSchema = new mongoose.Schema(
  {
    chainId: mongoose.Schema.Types.ObjectId,
    chainName: String,
    name: String,
    searchName: String,
    category: String,
    calories: Number,
    proteinG: Number,
    carbsG: Number,
    fatG: Number,
    isEstimate: Boolean,
    source: String,
    lastVerified: Date,
  },
  { collection: "menuItems", versionKey: false, timestamps: false }
);

module.exports = mongoose.model("MenuItem", menuItemSchema);
