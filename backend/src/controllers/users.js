const User = require("../models/User");
const { ageOn, calories, MULTIPLIERS } = require("../services/calories");
const httpError = require("../utils/httpError");
const readBody = require("../utils/readBody");
const toUserJSON = require("../utils/toUserJSON");

// Rules match docs/api-contract.md "Validation" (and db/schema.js, which rejects anything else).
// Messages start with the field name (docs/design-spec.md, Inputs). Values must already be the
// right JSON type: "65" is rejected, not converted.
const SEXES = ["male", "female"];
const ACTIVITY_LEVELS = Object.keys(MULTIPLIERS);
const GOALS = ["lose", "maintain", "gain"];
const UNITS = ["imperial", "metric"];
const RADII = [5, 10, 15, 20];
const MODES = ["protein", "carb"];
const PROFILE_FIELDS = ["heightIn", "weightLb", "birthDate", "sex", "activityLevel", "goal"];
const PREFERENCE_FIELDS = ["units", "searchRadius", "recommendationMode", "mealCalorieLimit"];
const AFTER = { returnDocument: "after" };

function checkRange(v, min, max, message) {
  if (!Number.isFinite(v) || v < min || v > max) throw httpError(400, message);
  return v;
}

function checkEnum(v, allowed, message) {
  if (!allowed.includes(v)) throw httpError(400, message);
  return v;
}

function checkGoal(v) {
  return checkEnum(v, GOALS, "Goal: lose, maintain or gain");
}

// "YYYY-MM-DD" -> Date at UTC midnight (how it's stored), for a real calendar date with age 18-119.
// 119 is the most the database's "at most 120 years ago" rule lets through.
function checkBirthDate(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof v === "string" ? v : "");
  const date = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Date.UTC rolls 2001-02-30 over to March, so a mismatch means the day doesn't exist.
  if (!date || date.toISOString().slice(0, 10) !== v) throw httpError(400, "Birth date: use YYYY-MM-DD");
  const age = ageOn(date, new Date());
  if (age < 18) throw httpError(400, "Birth date: you must be 18 or older");
  if (age > 119) throw httpError(400, "Birth date: check the year");
  return date;
}

function checkMealCalorieLimit(v) {
  return v === null ? null : checkRange(v, 100, 3000, "Meal calorie limit: 100 to 3000 calories, or none");
}

const PREFERENCE_CHECKS = {
  units: (v) => checkEnum(v, UNITS, "Units: imperial or metric"),
  searchRadius: (v) => checkEnum(v, RADII, "Search radius: 5, 10, 15 or 20 miles"),
  recommendationMode: (v) => checkEnum(v, MODES, "Recommendation mode: protein or carb"),
  mealCalorieLimit: checkMealCalorieLimit,
};

// The token outlived a deleted account.
function found(user) {
  if (!user) throw httpError(404, "User not found");
  return user;
}

async function getMe(req, res, next) {
  try {
    res.json(toUserJSON(found(await User.findById(req.userId).lean())));
  } catch (err) {
    next(err);
  }
}

// Replaces the whole profile: every field is required (the schema's profile is all-or-nothing).
async function updateProfile(req, res, next) {
  try {
    const b = readBody(req.body, PROFILE_FIELDS);
    const profile = {
      heightIn: checkRange(b.heightIn, 36, 96, "Height: 36 to 96 inches"),
      weightLb: checkRange(b.weightLb, 50, 700, "Weight: 50 to 700 lb"),
      birthDate: checkBirthDate(b.birthDate),
      sex: checkEnum(b.sex, SEXES, "Sex: male or female"),
      activityLevel: checkEnum(b.activityLevel, ACTIVITY_LEVELS, "Activity level: sedentary, light, moderate, active or very_active"),
      goal: checkGoal(b.goal),
    };
    const user = await User.findByIdAndUpdate(req.userId, { $set: { profile } }, AFTER).lean();
    res.json(toUserJSON(found(user)));
  } catch (err) {
    next(err);
  }
}

async function updateGoal(req, res, next) {
  try {
    const goal = checkGoal(readBody(req.body, ["goal"]).goal);
    // Only a user with a profile matches, so a goal can't create half a profile.
    const user = await User.findOneAndUpdate(
      { _id: req.userId, profile: { $ne: null } },
      { $set: { "profile.goal": goal } },
      AFTER
    ).lean();
    if (!user) {
      found(await User.exists({ _id: req.userId }));
      throw httpError(400, "Set your profile first");
    }
    res.json(toUserJSON(user));
  } catch (err) {
    next(err);
  }
}

// Partial merge: only the fields sent change. mealCalorieLimit: null goes back to target / 3.
async function updatePreferences(req, res, next) {
  try {
    const b = readBody(req.body, PREFERENCE_FIELDS);
    const keys = Object.keys(b);
    if (!keys.length) throw httpError(400, "Nothing to update");
    const set = {};
    for (const k of keys) set[`preferences.${k}`] = PREFERENCE_CHECKS[k](b[k]);
    const user = await User.findByIdAndUpdate(req.userId, { $set: set }, AFTER).lean();
    res.json(toUserJSON(found(user)));
  } catch (err) {
    next(err);
  }
}

async function getCalories(req, res, next) {
  try {
    const user = found(await User.findById(req.userId, { profile: 1, preferences: 1 }).lean());
    if (!user.profile) throw httpError(400, "Set your profile first");
    res.json(calories(user.profile, user.preferences));
  } catch (err) {
    next(err);
  }
}

module.exports = { getMe, updateProfile, updateGoal, updatePreferences, getCalories, found, MODES };
