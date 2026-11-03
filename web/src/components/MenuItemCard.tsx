import type { MenuItem, RecommendationMode } from '../types/api';
import { formatCalories } from '../units';
import MacroBar from './MacroBar';
import { FitPill } from './Pill';

// Spec section 4, Menu item card: name, restaurant, calories, macro bar. Recommendations add the score
// (worded for the response's mode) and the fit pill; search results get neither.
export default function MenuItemCard({
  item, score, mode, great,
}: { item: MenuItem; score?: number; mode?: RecommendationMode; great?: boolean }) {
  return (
    // h-full + mt-auto on the score row: cards in a grid row match heights when a name wraps.
    <article className="flex h-full flex-col gap-3 rounded-(--radius-card) border border-border bg-bg p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <h3 className="text-xl leading-[1.3] font-semibold">{item.name}</h3>
          <p className="text-sm text-text-muted">{item.isEstimate ? `${item.chainName} · estimated` : item.chainName}</p>
        </div>
        <span className="text-base font-semibold whitespace-nowrap tabular-nums">{formatCalories(item.calories)} cal</span>
      </div>
      <MacroBar item={item} />
      {score !== undefined && (
        <div className="mt-auto flex items-center justify-between gap-3">
          <span className="text-sm text-text-muted tabular-nums">
            {score.toFixed(1)} g {mode === 'carb' ? 'carbs' : 'protein'} per 100 cal
          </span>
          {great !== undefined && <FitPill great={great} />}
        </div>
      )}
    </article>
  );
}
