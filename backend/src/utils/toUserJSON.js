// The contract's User object. Fields are listed one by one so hashes and tokens can never leak.
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
    },
  };
}

module.exports = toUserJSON;
