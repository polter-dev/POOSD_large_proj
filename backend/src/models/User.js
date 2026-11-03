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
    // Optional (missing = ["calories", "protein"]). default: undefined, or Mongoose would store [] on register,
    // which the validator's minItems: 1 rejects.
    trackedNutrients: { type: [String], default: undefined },
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
    role: String, // optional; missing = "user" (only scripts/make-admin.js writes it)
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
