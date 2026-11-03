// The contract's User object. Fields are listed one by one so hashes and tokens can never leak.
// role and trackedNutrients are optional in the database (register stores neither), so missing ones get the
// contract's defaults here.
function toUserJSON(u) {
  const p = u.profile;
  const pref = u.preferences;
  return {
    id: String(u._id),
    firstName: u.firstName,
    lastName: u.lastName,
    username: u.username,
    email: u.email,
    isVerified: u.isVerified,
    role: u.role ?? "user",
    profile: p
      ? {
          heightIn: p.heightIn,
          weightLb: p.weightLb,
          birthDate: p.birthDate.toISOString().slice(0, 10), // stored as UTC midnight
          sex: p.sex,
          activityLevel: p.activityLevel,
          goal: p.goal,
        }
      : null,
    preferences: {
      units: pref.units,
      searchRadius: pref.searchRadius,
      recommendationMode: pref.recommendationMode,
      mealCalorieLimit: pref.mealCalorieLimit,
      trackedNutrients: pref.trackedNutrients ?? ["calories", "protein"],
    },
  };
}

module.exports = toUserJSON;
