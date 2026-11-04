import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import * as api from '../api';
import AppShell from '../components/AppShell';
import Banner from '../components/Banner';
import Button from '../components/Button';
import MacroBar from '../components/MacroBar';
import SegmentedControl from '../components/SegmentedControl';
import StatusMessage from '../components/StatusMessage';
import { useAuth } from '../context/AuthContext';
import { addDays, formatDay, todayISO } from '../dates';
import { errorMessage } from '../errors';
import { currentPosition, LocationError } from '../location';
import type { MealPlanDay, MealPlanResponse, RecommendedItem } from '../types/api';
import { formatCalories, formatGrams } from '../units';

type View = 'day' | 'week';

// "Nearby only": the chains of the restaurants around the user, looked up once per visit.
// null = everywhere (switch off, or location not available).
type Nearby = { state: 'off' } | { state: 'locating' } | { state: 'on'; chainIds: string[] };

function PlanItem({ item, added, busy, onAdd }: {
  item: RecommendedItem; added: boolean; busy: boolean; onAdd: () => void;
}) {
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="text-base font-semibold">{item.name}</span>
          <span className="text-sm text-text-muted">{item.chainName}</span>
        </div>
        <span className="text-base font-semibold whitespace-nowrap tabular-nums">{formatCalories(item.calories)} cal</span>
      </div>
      <MacroBar item={item} />
      <div className="flex justify-end">
        {added ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-fit-great-text">
            <svg className="size-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M2.5 6.5 5 9l4.5-5.5" />
            </svg>
            In your plan
          </span>
        ) : (
          <Button variant="secondary" className="h-10! w-auto! px-4 text-sm" loading={busy} onClick={onAdd} aria-label={`Add ${item.name} to plan`}>
            Add to plan
          </Button>
        )}
      </div>
    </li>
  );
}

function DayCard({ day, isAdded, busy, onAdd }: {
  day: MealPlanDay;
  isAdded: (date: string, id: string) => boolean;
  busy: string | null;
  onAdd: (date: string, items: RecommendedItem[], key: string) => void;
}) {
  const left = day.items.filter((i) => !isAdded(day.date, i.id));
  const t = day.totals;
  return (
    <section className="flex flex-col gap-3 rounded-(--radius-card) border border-border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <h2 className="text-xl leading-[1.3] font-semibold">{day.date === todayISO() ? `Today, ${formatDay(day.date).split(', ')[1]}` : formatDay(day.date)}</h2>
          <p className="text-sm text-text-muted tabular-nums">
            {formatCalories(day.remainingCalories)} cal left today · up to {formatCalories(day.mealCalorieLimit)} cal a meal
          </p>
        </div>
        {left.length > 1 && (
          <Button className="h-10! w-auto! px-4 text-sm" loading={busy === `day:${day.date}`} disabled={busy !== null} onClick={() => onAdd(day.date, left, `day:${day.date}`)}>
            Add whole day
          </Button>
        )}
      </div>
      {day.items.length === 0 ? (
        <p className="text-base text-text-muted">
          {day.remainingCalories < 300 ? 'Your calories for this day are already planned or eaten.' : 'No more picks fit this day.'}
        </p>
      ) : (
        <>
          <ul className="flex flex-col">
            {day.items.map((item) => (
              <PlanItem
                key={item.id}
                item={item}
                added={isAdded(day.date, item.id)}
                busy={busy === `${day.date}:${item.id}`}
                onAdd={() => onAdd(day.date, [item], `${day.date}:${item.id}`)}
              />
            ))}
          </ul>
          <p className="text-sm text-text-muted tabular-nums">
            Picks total: {formatCalories(t.calories)} cal · {t.incomplete ? 'at least ' : ''}P {formatGrams(t.proteinG)}g · C{' '}
            {formatGrams(t.carbsG)}g · F {formatGrams(t.fatG)}g
          </p>
        </>
      )}
    </section>
  );
}

// #116: suggested eats from what's left of each day's target (GET /meal-plans). Opting in sends the picks
// to the tracker as planned rows (POST /meal-logs, status "planned", source "plan").
export default function PlanPage() {
  const { user } = useAuth();
  const [view, setView] = useState<View>('day');
  const [start, setStart] = useState(todayISO);
  const [nearby, setNearby] = useState<Nearby>({ state: 'off' });
  const [loaded, setLoaded] = useState<{ key: string; res: MealPlanResponse } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<string>>(() => new Set()); // `${date}:${menuItemId}`
  const [reload, setReload] = useState(0);
  const request = useRef(0);

  const days = view === 'day' ? 1 : 7;
  const chainIds = nearby.state === 'on' ? nearby.chainIds : undefined;
  const key = `${start}/${days}/${chainIds?.join(',') ?? 'all'}/${reload}`;
  const plan = loaded?.key === key ? loaded.res : null;
  const today = todayISO();

  const noNearbyData = nearby.state === 'on' && nearby.chainIds.length === 0; // shown below instead of a plan
  const waiting = nearby.state === 'locating' || noNearbyData;

  useEffect(() => {
    if (waiting) return;
    const id = ++request.current;
    api.getMealPlan({ start, days, chainIds }).then(
      (res) => id === request.current && (setLoaded({ key, res }), setError(null)),
      (err) => id === request.current && setError(errorMessage(err)),
    );
  }, [key, start, days, chainIds, waiting]);

  async function toggleNearby() {
    if (nearby.state !== 'off') return setNearby({ state: 'off' });
    setNearby({ state: 'locating' });
    setNotice(null);
    try {
      const here = await currentPosition();
      const { restaurants } = await api.nearby({ ...here, radiusMiles: user!.preferences.searchRadius });
      setNearby({ state: 'on', chainIds: [...new Set(restaurants.flatMap((r) => (r.chainId ? [r.chainId] : [])))] });
    } catch (err) {
      setNearby({ state: 'off' });
      setNotice(
        err instanceof LocationError
          ? "Couldn't get your location, so the plan uses every restaurant."
          : `Couldn't find nearby restaurants (${errorMessage(err)}), so the plan uses every restaurant.`,
      );
    }
  }

  async function add(date: string, items: RecommendedItem[], busyKey: string) {
    setBusy(busyKey);
    setError(null);
    try {
      await api.addMealLogs({
        entries: items.map((i) => ({ date, status: 'planned', source: 'plan', menuItemId: i.id })),
      });
      setAdded((s) => new Set([...s, ...items.map((i) => `${date}:${i.id}`)]));
      setNotice(`Added ${items.length === 1 ? items[0].name : `${items.length} items`} to ${formatDay(date)} as planned.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const step = days;
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <Link to="/tracker" className="-mb-2 self-start text-sm font-semibold text-primary hover:underline">
          ← Tracker
        </Link>
        <div>
          <h1 className="text-[28px] leading-[1.2] font-bold">Meal plan</h1>
          <p className="mt-2 text-base text-text-muted">
            Picks that fit what's left of your daily target. Add them to your tracker as planned, then mark them eaten.
          </p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="sm:w-[240px]">
            <SegmentedControl<View>
              label="Plan"
              value={view}
              onChange={setView}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
              ]}
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={start <= today}
              onClick={() => setStart(start <= addDays(today, step) ? today : addDays(start, -step))}
              aria-label={view === 'day' ? 'Previous day' : 'Previous week'}
              className="flex size-12 items-center justify-center rounded-(--radius-input) border border-border-input hover:bg-surface disabled:opacity-40"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
            </button>
            <p className="min-w-[150px] text-center text-base font-semibold" aria-live="polite">
              {view === 'day' ? formatDay(start) : `${formatDay(start)} + 6 days`}
            </p>
            <button
              type="button"
              onClick={() => setStart(addDays(start, step))}
              aria-label={view === 'day' ? 'Next day' : 'Next week'}
              className="flex size-12 items-center justify-center rounded-(--radius-input) border border-border-input hover:bg-surface"
            >
              <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
            </button>
          </div>
        </div>

        <label className="flex cursor-pointer items-center gap-3 self-start">
          <input
            type="checkbox"
            role="switch"
            checked={nearby.state !== 'off'}
            disabled={nearby.state === 'locating'}
            onChange={toggleNearby}
            className="peer sr-only"
          />
          <span
            aria-hidden="true"
            className="relative h-7 w-12 rounded-full bg-border-input transition-colors peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary after:absolute after:top-1 after:left-1 after:size-5 after:rounded-full after:bg-bg after:transition-transform peer-checked:after:translate-x-5"
          />
          <span className="text-base font-semibold">
            Nearby only{nearby.state === 'locating' && <span className="font-normal text-text-muted"> · finding restaurants…</span>}
          </span>
        </label>

        {error && <Banner message={error} actionLabel="Try again" onAction={() => setReload((n) => n + 1)} />}
        {notice && <Banner info message={notice} />}

        {noNearbyData ? (
          <StatusMessage title="Nothing nearby has nutrition data" message="Turn off Nearby only to plan from every restaurant." />
        ) : !plan ? (
          !error && <StatusMessage loading message="Planning your meals…" />
        ) : (
          <div className="flex flex-col gap-3">
            {plan.days.map((d) => (
              <DayCard key={d.date} day={d} busy={busy} isAdded={(date, id) => added.has(`${date}:${id}`)} onAdd={add} />
            ))}
          </div>
        )}
        {added.size > 0 && (
          <Link to="/tracker" className="flex h-12 items-center justify-center rounded-(--radius-input) bg-primary px-4 font-semibold text-on-primary hover:bg-primary-hover sm:w-[280px]">
            See it in the tracker
          </Link>
        )}
      </div>
    </AppShell>
  );
}
