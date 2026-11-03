// The contract's MealLog object. userId is never returned. Macros are for one serving.
function toMealLogJSON(l) {
  return {
    id: String(l._id),
    date: l.date,
    status: l.status,
    menuItemId: l.menuItemId && String(l.menuItemId), // may name an item that no longer exists
    name: l.name,
    chainName: l.chainName,
    servings: l.servings,
    calories: l.calories,
    proteinG: l.proteinG,
    carbsG: l.carbsG,
    fatG: l.fatG,
    source: l.source,
    createdAt: l.createdAt.toISOString(),
  };
}

module.exports = toMealLogJSON;
