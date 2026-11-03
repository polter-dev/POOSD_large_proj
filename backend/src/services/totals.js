// The contract's Totals (docs/api-contract.md "Totals"), for meal logs (#108) and meal plans (#111). Pure.

const MACROS = ["proteinG", "carbsG", "fatG"];

// Sums of value * servings; a missing servings counts as 1 (a plan's items are one serving each). Integer
// calories and 1-decimal macros. A null macro adds nothing (never 0) and marks the totals incomplete, so the UI
// can say "at least".
function totals(entries) {
  const t = { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, incomplete: false };
  for (const e of entries) {
    const servings = e.servings ?? 1;
    t.calories += e.calories * servings;
    for (const m of MACROS) {
      if (e[m] == null) t.incomplete = true;
      else t[m] += e[m] * servings;
    }
  }
  t.calories = Math.round(t.calories);
  for (const m of MACROS) t[m] = Math.round(t[m] * 10) / 10;
  return t;
}

// GET /meal-logs "days": one row per date in `dates`, in that order, with empty days as zero totals.
// entries are meal logs ({ date, status, servings, calories, proteinG, carbsG, fatG }).
function dailyTotals(entries, dates) {
  return dates.map((date) => {
    const day = entries.filter((e) => e.date === date);
    return {
      date,
      eaten: totals(day.filter((e) => e.status === "eaten")),
      planned: totals(day.filter((e) => e.status === "planned")),
    };
  });
}

module.exports = { totals, dailyTotals };
