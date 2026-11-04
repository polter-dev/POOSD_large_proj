import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import * as api from '../api';
import { Link } from 'react-router';
import AppShell from '../components/AppShell';
import Banner from '../components/Banner';
import Button from '../components/Button';
import PhotoLog from '../components/PhotoLog';
import SegmentedControl from '../components/SegmentedControl';
import StatusMessage from '../components/StatusMessage';
import TextField from '../components/TextField';
import { useAuth } from '../context/AuthContext';
import { addDays, formatDay, formatRange, mondayOf, todayISO } from '../dates';
import { errorMessage } from '../errors';
import type { Calories, MealLog, MealLogsResponse, MenuItem, Nutrient, Totals } from '../types/api';
import { formatCalories, formatGrams, round1 } from '../units';

type View = 'day' | 'week';

// One row per nutrient the user can track, in the order the chips and bars show them.
const NUTRIENTS: { key: Nutrient; label: string; total: (t: Totals) => number; goal: (c: Calories) => number }[] = [
  { key: 'calories', label: 'Calories', total: (t) => t.calories, goal: (c) => c.target },
  { key: 'protein', label: 'Protein', total: (t) => t.proteinG, goal: (c) => c.macros.proteinG },
  { key: 'carbs', label: 'Carbs', total: (t) => t.carbsG, goal: (c) => c.macros.carbsG },
  { key: 'fat', label: 'Fat', total: (t) => t.fatG, goal: (c) => c.macros.fatG },
];

const SEARCH_LIMIT = 8;
const DEBOUNCE_MS = 250;

const fmt = (key: Nutrient, n: number) => (key === 'calories' ? `${formatCalories(Math.round(n))} cal` : `${formatGrams(n)} g`);
const servingsLabel = (n: number) => `${n} ${n === 1 ? 'serving' : 'servings'}`;

// Adds the range's day rows together (week view), with macros back to the API's 1 decimal.
function sumTotals(rows: Totals[]): Totals {
  const t = rows.reduce(
    (a, r) => ({
      calories: a.calories + r.calories,
      proteinG: a.proteinG + r.proteinG,
      carbsG: a.carbsG + r.carbsG,
      fatG: a.fatG + r.fatG,
      incomplete: a.incomplete || r.incomplete,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0, incomplete: false },
  );
  return { ...t, proteinG: round1(t.proteinG), carbsG: round1(t.carbsG), fatG: round1(t.fatG) };
}

// Spec, Macro bar look: 8 tall, rounded. Eaten fills primary; planned shows hatched after it; past the goal
// the bar turns the warning color and the text says "over" (color is never the only signal).
function ProgressBar({ nutrient, eaten, planned, goal, incomplete }: {
  nutrient: (typeof NUTRIENTS)[number]; eaten: number; planned: number; goal: number; incomplete: boolean;
}) {
  const over = eaten > goal;
  const eatenShare = goal > 0 ? Math.min(eaten / goal, 1) : 1;
  const plannedShare = goal > 0 ? Math.min(planned / goal, 1 - eatenShare) : 0;
  // Calories are never unknown; a null macro makes the macro sums a lower bound.
  const atLeast = incomplete && nutrient.key !== 'calories' ? 'at least ' : '';
  const diff = Math.abs(goal - eaten);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className="text-base font-semibold">{nutrient.label}</span>
        <span className="text-sm text-text-muted tabular-nums">
          {atLeast}
          <span className={`font-semibold ${over ? 'text-fit-ok-text' : 'text-text'}`}>{fmt(nutrient.key, eaten)}</span> of{' '}
          {fmt(nutrient.key, goal)}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={nutrient.label}
        aria-valuemin={0}
        aria-valuemax={Math.round(goal)}
        aria-valuenow={Math.round(eaten)}
        aria-valuetext={`${atLeast}${fmt(nutrient.key, eaten)} of ${fmt(nutrient.key, goal)}${over ? ', over the goal' : ''}`}
        className="flex h-2 overflow-hidden rounded bg-surface"
      >
        <div className={`h-full ${over ? 'bg-fit-ok-text' : 'bg-primary'}`} style={{ width: `${eatenShare * 100}%` }} />
        {plannedShare > 0 && (
          <div
            className="h-full"
            style={{
              width: `${plannedShare * 100}%`,
              background: 'repeating-linear-gradient(135deg, var(--primary) 0 1.5px, var(--surface) 1.5px 5px)',
            }}
          />
        )}
      </div>
      <p className="text-sm text-text-muted tabular-nums">
        {over ? (
          <span className="font-semibold text-fit-ok-text">{fmt(nutrient.key, diff)} over</span>
        ) : (
          `${fmt(nutrient.key, diff)} left`
        )}
        {planned > 0 && ` · ${fmt(nutrient.key, planned)} planned`}
      </p>
    </div>
  );
}

function EntryRow({ entry, busy, onEat, onDelete }: {
  entry: MealLog; busy: boolean; onEat: () => void; onDelete: () => void;
}) {
  const planned = entry.status === 'planned';
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border py-3 last:border-b-0">
      <div className={`flex min-w-0 flex-1 flex-col ${planned ? 'opacity-60' : ''}`}>
        <span className="text-base font-semibold">
          {entry.name}
          {planned && <span className="ml-2 text-sm font-normal text-text-muted">(planned)</span>}
        </span>
        <span className="text-sm text-text-muted">
          {[entry.chainName, servingsLabel(entry.servings)].filter(Boolean).join(' · ')}
        </span>
      </div>
      <span className={`text-base font-semibold whitespace-nowrap tabular-nums ${planned ? 'opacity-60' : ''}`}>
        {formatCalories(Math.round(entry.calories * entry.servings))} cal
      </span>
      <div className="flex gap-2">
        {planned && (
          <button
            type="button"
            disabled={busy}
            onClick={onEat}
            className="rounded-(--radius-input) bg-primary px-3 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-70"
          >
            Ate it
          </button>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={onDelete}
          aria-label={`Delete ${entry.name}`}
          className="rounded-(--radius-input) border border-border-input px-3 py-2 text-sm font-semibold hover:bg-surface disabled:opacity-70"
        >
          Delete
        </button>
      </div>
    </li>
  );
}

// Search the menus (server partial match) and add the picked item to the selected day as eaten.
function AddFood({ date, onAdded }: { date: string; onAdded: (name: string) => void }) {
  const [q, setQ] = useState('');
  const [servings, setServings] = useState('1');
  const [items, setItems] = useState<MenuItem[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const n = Number(servings);
  const servingsError = servings.trim() === '' || !Number.isFinite(n) || n < 0.25 || n > 10 ? 'Servings: 0.25 to 10' : null;

  async function search(query: string) {
    const id = ++request.current;
    setSearching(true);
    setError(null);
    try {
      const res = await api.searchMenuItems(query, SEARCH_LIMIT);
      if (id === request.current) setItems(res.items);
    } catch (err) {
      if (id === request.current) setError(errorMessage(err));
    } finally {
      if (id === request.current) setSearching(false);
    }
  }

  function change(v: string) {
    setQ(v);
    clearTimeout(timer.current);
    const query = v.trim();
    if (query.length < 2) {
      request.current++;
      setItems(null);
      setSearching(false);
      return;
    }
    timer.current = setTimeout(() => void search(query), DEBOUNCE_MS);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    clearTimeout(timer.current);
    if (q.trim().length >= 2) void search(q.trim());
  }

  async function add(item: MenuItem) {
    if (servingsError) return;
    setAdding(item.id);
    setError(null);
    try {
      await api.addMealLogs({ entries: [{ date, menuItemId: item.id, servings: n, source: 'search' }] });
      onAdded(item.name);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setAdding(null);
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-(--radius-card) border border-border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div>
        <h2 className="text-xl leading-[1.3] font-semibold">Add food</h2>
        <p className="text-sm text-text-muted">Adds to {formatDay(date)} as eaten.</p>
      </div>
      <form role="search" onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_140px]">
        <TextField
          label="Menu item"
          type="search"
          value={q}
          onChange={change}
          maxLength={100}
          autoComplete="off"
          placeholder='Try "chicken"'
        />
        <TextField
          label="Servings"
          type="number"
          inputMode="decimal"
          min={0.25}
          max={10}
          step={0.25}
          value={servings}
          onChange={setServings}
          error={servingsError}
        />
      </form>
      {error && <Banner message={error} />}
      {searching && !items && <p className="text-sm text-text-muted" role="status">Searching…</p>}
      {items && items.length === 0 && <p className="text-sm text-text-muted" role="status">No menu items match "{q.trim()}".</p>}
      {items && items.length > 0 && (
        <ul className="flex flex-col" aria-label="Search results">
          {items.map((item) => (
            <li key={item.id} className="flex items-center gap-4 border-b border-border py-3 last:border-b-0">
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-base font-semibold">{item.name}</span>
                <span className="text-sm text-text-muted">{item.chainName}</span>
              </div>
              <span className="text-sm whitespace-nowrap text-text-muted tabular-nums">{formatCalories(item.calories)} cal</span>
              <Button
                variant="secondary"
                className="h-10! w-auto! px-4"
                loading={adding === item.id}
                disabled={adding !== null || !!servingsError}
                onClick={() => add(item)}
                aria-label={`Add ${item.name}`}
              >
                Add
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// #115: day/week meal tracker. Totals come from GET /meal-logs (the server sums value × servings);
// goals from GET /users/me/calories, × 7 for a week. Only the user's tracked nutrients get a bar.
export default function TrackerPage() {
  const { user, setUser } = useAuth();
  const [view, setView] = useState<View>('day');
  const [anchor, setAnchor] = useState(todayISO);
  const [loaded, setLoaded] = useState<{ range: string; res: MealLogsResponse } | null>(null);
  const [cal, setCal] = useState<Calories | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // entry id being changed
  const [savingChips, setSavingChips] = useState(false);
  const request = useRef(0);

  const from = view === 'day' ? anchor : mondayOf(anchor);
  const to = view === 'day' ? anchor : addDays(from, 6);
  const days = view === 'day' ? 1 : 7;
  const tracked = user!.preferences.trackedNutrients;
  const range = `${from}/${to}`;
  // A week's answer is never shown under a different week while the new one loads.
  const logs = loaded?.range === range ? loaded.res : null;

  // Every fetch gets an id, so a slow answer for an older range never replaces a newer one.
  const fetchLogs = useCallback(() => {
    const id = ++request.current;
    return api.getMealLogs(from, to).then(
      (res) => {
        if (id !== request.current) return;
        setLoaded({ range: `${from}/${to}`, res });
        setError(null);
      },
      (err) => {
        if (id === request.current) setError(errorMessage(err));
      },
    );
  }, [from, to]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const profile = user?.profile;
  useEffect(() => {
    let current = true;
    api.getCalories()
      .then((c) => current && setCal(c))
      .catch((err) => current && setError(errorMessage(err)));
    return () => {
      current = false;
    };
  }, [profile]);

  async function toggle(key: Nutrient) {
    const on = tracked.includes(key);
    if (on && tracked.length === 1) return; // at least one stays on
    // Keep the chips' order so the bars don't jump around.
    const next = NUTRIENTS.map((n) => n.key).filter((k) => (k === key ? !on : tracked.includes(k)));
    setSavingChips(true);
    try {
      setUser(await api.updatePreferences({ trackedNutrients: next }));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSavingChips(false);
    }
  }

  async function change(id: string, action: () => Promise<unknown>) {
    setBusy(id);
    setNotice(null);
    try {
      await action();
      await fetchLogs();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  const eaten = logs ? sumTotals(logs.days.map((d) => d.eaten)) : null;
  const planned = logs ? sumTotals(logs.days.map((d) => d.planned)) : null;
  const today = todayISO();
  const step = view === 'day' ? 1 : 7;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-[28px] leading-[1.2] font-bold">Tracker</h1>
            <p className="mt-2 text-base text-text-muted">What you've eaten against your daily targets.</p>
          </div>
          {/* #116: photo logging adds to the selected day; the plan page adds planned rows. */}
          <div className="flex flex-col gap-3 sm:flex-row">
            <PhotoLog
              date={anchor}
              onLogged={(n) => {
                void fetchLogs();
                setNotice(`Logged ${n} ${n === 1 ? 'item' : 'items'} from your photo to ${formatDay(anchor)}.`);
              }}
            />
            <Link
              to="/plan"
              className="flex h-12 items-center justify-center rounded-(--radius-input) bg-primary px-5 font-semibold whitespace-nowrap text-on-primary hover:bg-primary-hover"
            >
              Plan meals
            </Link>
          </div>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="sm:w-[240px]">
            <SegmentedControl<View>
              label="View"
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
              onClick={() => setAnchor(addDays(anchor, -step))}
              aria-label={view === 'day' ? 'Previous day' : 'Previous week'}
              className="flex size-12 items-center justify-center rounded-(--radius-input) border border-border-input hover:bg-surface"
            >
              <Chevron dir="left" />
            </button>
            <p className="min-w-[150px] text-center text-base font-semibold" aria-live="polite">
              {view === 'day' ? (anchor === today ? `Today, ${formatDay(anchor).split(', ')[1]}` : formatDay(anchor)) : formatRange(from, to)}
            </p>
            <button
              type="button"
              onClick={() => setAnchor(addDays(anchor, step))}
              aria-label={view === 'day' ? 'Next day' : 'Next week'}
              className="flex size-12 items-center justify-center rounded-(--radius-input) border border-border-input hover:bg-surface"
            >
              <Chevron dir="right" />
            </button>
            {anchor !== today && (
              <button type="button" onClick={() => setAnchor(today)} className="px-2 text-sm font-semibold text-primary hover:underline">
                Today
              </button>
            )}
          </div>
        </div>

        {error && <Banner message={error} />}
        {notice && <Banner info message={notice} />}

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-semibold">Track</legend>
          <div className="flex flex-wrap gap-2">
            {NUTRIENTS.map((n) => {
              const on = tracked.includes(n.key);
              const last = on && tracked.length === 1;
              return (
                <button
                  key={n.key}
                  type="button"
                  aria-pressed={on}
                  disabled={savingChips || last}
                  title={last ? 'Track at least one nutrient' : undefined}
                  onClick={() => toggle(n.key)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed ${
                    on ? 'border-primary bg-fit-great-bg text-fit-great-text' : 'border-border-input bg-bg text-text-muted hover:bg-surface'
                  } ${savingChips ? 'opacity-70' : ''}`}
                >
                  {on && (
                    <svg className="size-3.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M2.5 6.5 5 9l4.5-5.5" />
                    </svg>
                  )}
                  {n.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        {!logs || !cal ? (
          !error && <StatusMessage loading message="Loading your log…" />
        ) : (
          <>
            <section className="flex flex-col gap-5 rounded-(--radius-card) border border-border p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
              <h2 className="text-xl leading-[1.3] font-semibold">{view === 'week' ? 'Weekly goal' : anchor === today ? 'Today’s goal' : 'Daily goal'}</h2>
              {NUTRIENTS.filter((n) => tracked.includes(n.key)).map((n) => (
                <ProgressBar
                  key={n.key}
                  nutrient={n}
                  eaten={n.total(eaten!)}
                  planned={n.total(planned!)}
                  goal={n.goal(cal) * days}
                  incomplete={eaten!.incomplete}
                />
              ))}
            </section>

            <section className="flex flex-col gap-2">
              <h2 className="text-xl leading-[1.3] font-semibold">Entries</h2>
              {logs.entries.length === 0 ? (
                <p className="text-base text-text-muted">Nothing logged {view === 'day' ? 'this day' : 'this week'} yet.</p>
              ) : view === 'day' ? (
                <EntryList entries={logs.entries} busy={busy} change={change} />
              ) : (
                logs.days
                  .filter((d) => logs.entries.some((e) => e.date === d.date))
                  .map((d) => (
                    <div key={d.date} className="flex flex-col">
                      <h3 className="mt-2 flex justify-between text-sm font-semibold text-text-muted">
                        <span>{formatDay(d.date)}</span>
                        <span className="tabular-nums">{formatCalories(d.eaten.calories)} cal eaten</span>
                      </h3>
                      <EntryList entries={logs.entries.filter((e) => e.date === d.date)} busy={busy} change={change} />
                    </div>
                  ))
              )}
            </section>
          </>
        )}

        <AddFood
          date={anchor}
          onAdded={(name) => {
            void fetchLogs();
            setNotice(`Added ${name} to ${formatDay(anchor)}.`);
          }}
        />
      </div>
    </AppShell>
  );
}

function EntryList({ entries, busy, change }: {
  entries: MealLog[]; busy: string | null; change: (id: string, action: () => Promise<unknown>) => void;
}) {
  return (
    <ul className="flex flex-col">
      {entries.map((e) => (
        <EntryRow
          key={e.id}
          entry={e}
          busy={busy === e.id}
          onEat={() => change(e.id, () => api.updateMealLog(e.id, { status: 'eaten' }))}
          onDelete={() => change(e.id, () => api.deleteMealLog(e.id))}
        />
      ))}
    </ul>
  );
}

function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={dir === 'left' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} />
    </svg>
  );
}
