const mongoose = require("mongoose");

// Mirrors the favorites $jsonSchema in db/schema.js: only the user, the place ID and a label (spec N4).
const favoriteSchema = new mongoose.Schema(
  {
    userId: mongoose.Schema.Types.ObjectId,
    placeId: String,
    label: { type: String, default: null },
  },
  { collection: "favorites", versionKey: false, timestamps: { createdAt: true, updatedAt: false } }
);

module.exports = mongoose.model("Favorite", favoriteSchema);
