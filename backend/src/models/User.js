const mongoose = require("mongoose");

// Mirrors the users $jsonSchema in db/schema.js, which rejects any field not listed there.
const profileSchema = new mongoose.Schema(
  {
    heightIn: Number,
    weightLb: Number,
    birthDate: Date,
    sex: String,
    activityLevel: String,
    goal: String,
  },
  { _id: false }
);

const preferencesSchema = new mongoose.Schema(
  {
    units: String,
    searchRadius: Number,
    recommendationMode: String,
    mealCalorieLimit: Number,
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    firstName: String,
    lastName: String,
    username: String,
    email: String,
    passwordHash: String,
    isVerified: Boolean,
    verificationTokenHash: String,
    verificationTokenExpires: Date,
    resetTokenHash: String,
    resetTokenExpires: Date,
    profile: { type: profileSchema, default: null },
    preferences: preferencesSchema,
  },
  { collection: "users", versionKey: false, timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
