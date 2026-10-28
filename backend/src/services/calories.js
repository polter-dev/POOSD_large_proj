// Daily and per-meal calorie targets (docs/api-contract.md "Calories", #24). Same math as query 21 in
// db/queries.md, plus the 1200/1500 floor. Pure, so the unit tests can pass their own "now".

const MULTIPLIERS = { sedentary: 1.2, light: 1.375, moderate: 1.55, active: 1.725, very_active: 1.9 };
const GOAL_ADJUST = { lose: -500, maintain: 0, gain: 300 };
const FLOOR = { female: 1200, male: 1500 };

// Whole years from birthDate to now, in UTC like the stored birthDate (UTC midnight) and the
// database's age rule in db/schema.js.
function ageOn(birthDate, now) {
  let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
  const month = now.getUTCMonth() - birthDate.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < birthDate.getUTCDate())) age -= 1;
  return age;
}

// { age, maintenance, target, perMeal }, all integers. profile must not be null.
function calories(profile, preferences, now = new Date()) {
  const age = ageOn(profile.birthDate, now);
  const kg = profile.weightLb * 0.453592;
  const cm = profile.heightIn * 2.54;
  const bmr = 10 * kg + 6.25 * cm - 5 * age + (profile.sex === "male" ? 5 : -161);
  const maintenance = Math.round(bmr * MULTIPLIERS[profile.activityLevel]);
  const target = Math.max(maintenance + GOAL_ADJUST[profile.goal], FLOOR[profile.sex]);
  const perMeal = preferences.mealCalorieLimit ?? Math.round(target / 3);
  return { age, maintenance, target, perMeal };
}

module.exports = { ageOn, calories, MULTIPLIERS };
