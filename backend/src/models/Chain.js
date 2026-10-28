const mongoose = require("mongoose");

// Read-only here: chains are loaded by db/seed.js, and the collection's $jsonSchema validator owns the rules.
const chainSchema = new mongoose.Schema(
  {
    name: String,
    nameKey: String,
    alternateNames: [String],
    nutritionSourceUrl: String,
  },
  { collection: "chains", timestamps: true }
);

module.exports = mongoose.model("Chain", chainSchema);
