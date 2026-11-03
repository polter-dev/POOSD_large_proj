import { macroShares } from '../fit';
import type { MenuItem } from '../types/api';
import { formatGrams } from '../units';

const COLORS = ['var(--macro-protein)', 'var(--macro-carbs)', 'var(--macro-fat)'];
const LETTERS = ['P', 'C', 'F'];
const NAMES = ['protein', 'carbs', 'fat'];

// Spec section 4, Macro bar: one 8-tall bar split by calories, unknown macros hatched (never drawn as 0),
// and a "P 32g  C 45g  F 12g" legend underneath.
export default function MacroBar({ item }: { item: MenuItem }) {
  const grams = [item.proteinG, item.carbsG, item.fatG];
  const shares = macroShares(item);
  const allUnknown = grams.every((g) => g === null);
  const anyUnknown = grams.some((g) => g === null);
  const used = shares.reduce((a, s) => a + s, 0);
  const spoken = allUnknown
    ? 'Macros unknown'
    : grams.map((g, i) => `${NAMES[i]} ${g === null ? 'unknown' : `${formatGrams(g)} grams`}`).join(', ');

  return (
    <div role="img" aria-label={spoken} className="flex flex-col gap-2">
      <div className="flex h-2 overflow-hidden rounded bg-surface">
        {shares.map((s, i) =>
          s > 0 ? (
            // A white gap between segments, not after the last one when the bar is full.
            <div key={i} className="h-full border-r-2 border-bg last:border-r-0" style={{ width: `${s * 100}%`, background: COLORS[i] }} />
          ) : null,
        )}
        {used < 0.999 && anyUnknown && (
          <div
            className="h-full flex-1"
            style={{ background: 'repeating-linear-gradient(135deg, var(--macro-unknown) 0 1.5px, var(--surface) 1.5px 5px)' }}
          />
        )}
      </div>
      {allUnknown ? (
        <p className="text-sm text-text-muted">Macros unknown</p>
      ) : (
        <p className="flex flex-wrap gap-x-4 text-sm text-text-muted tabular-nums" aria-hidden="true">
          {grams.map((g, i) => (
            <span key={i} className="inline-flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: COLORS[i] }} />
              {LETTERS[i]} {g === null ? '?' : `${formatGrams(g)}g`}
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
