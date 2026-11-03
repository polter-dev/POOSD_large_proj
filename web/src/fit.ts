import type { MenuItem } from './types/api';

// Recommendations only: the first ceil(n / 3) by score are "Great fit", the rest "OK" (spec, Fit pill).
export const greatFitCount = (n: number) => Math.ceil(n / 3);

const KCAL_PER_GRAM = [4, 4, 9];

// Each macro's share of an item's bar (spec section 4, Macro bar), protein / carbs / fat. All known:
// shares of the three together, so the bar is full. Some unknown (null, never 0): each known segment is
// its share of the item's calories, capped so it can't overflow; the rest is drawn hatched.
// Same math as mobile's MacroBar.shares.
export function macroShares(item: MenuItem) {
  const kcal = [item.proteinG, item.carbsG, item.fatG].map((g, i) => (g === null ? null : g * KCAL_PER_GRAM[i]));
  if (kcal.every((k) => k !== null)) {
    const total = kcal.reduce((a, k) => a + k!, 0);
    return kcal.map((k) => (total > 0 ? k! / total : 0));
  }
  let left = 1;
  return kcal.map((k) => {
    const s = k === null || item.calories <= 0 ? 0 : Math.min(k / item.calories, left);
    left -= s;
    return s;
  });
}
