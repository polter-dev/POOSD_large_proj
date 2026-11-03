import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import * as api from '../api';
import AppShell from '../components/AppShell';
import Banner from '../components/Banner';
import Button from '../components/Button';
import Pill from '../components/Pill';
import StatusMessage from '../components/StatusMessage';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../errors';
import { currentPosition, LocationError, type LocationProblem } from '../location';
import type { NearbyRestaurant, SearchRadius } from '../types/api';
import { formatCalories } from '../units';

const RADII: SearchRadius[] = [5, 10, 15, 20];
// The fit counts are one POST /recommendations for every nearby chain (spec, Restaurant card); 50 is the
// contract's maximum, so a full page means each count is only a lower bound.
const FIT_LIMIT = 50;

interface Found {
  restaurants: NearbyRestaurant[];
  fits: Record<string, number> | null; // chainId -> items that fit; null if the count failed, missing if unknown
  full: boolean; // the count page was full: every count is "N+"
  perMeal: number | null;
}

type View =
  | { kind: 'locating' }
  | { kind: 'searching' }
  | { kind: 'problem'; problem: LocationProblem }
  | { kind: 'error'; message: string }
  | ({ kind: 'done' } & Found);

// #34, prototype screen 07: restaurants within 5 to 20 miles (POST /restaurants/nearby), each with how many
// of its items fit the goal. Same rules as mobile's NearbyScreen. The position is only used for the
// request; the radius is saved to preferences (PATCH) so it's remembered next time.
export default function NearbyPage() {
  const { user, setUser } = useAuth();
  const [radius, setRadius] = useState<SearchRadius>(user!.preferences.searchRadius);
  const [view, setView] = useState<View>({ kind: 'locating' });
  const [saved, setSaved] = useState<Record<string, string>>({}); // placeId -> favorite id
  const [saveError, setSaveError] = useState<string | null>(null);
  const here = useRef<{ lat: number; lng: number } | null>(null); // located once per visit
  const request = useRef(0); // only the newest answer is shown when the radius changes quickly
  const firstRadius = useRef(radius);

  const load = useCallback(async (r: SearchRadius) => {
    const id = ++request.current;
    const current = () => id === request.current;
    try {
      if (!here.current) {
        here.current = await currentPosition();
        if (!current()) return;
        setView({ kind: 'searching' });
      }
      const { restaurants } = await api.nearby({ ...here.current, radiusMiles: r });
      const chainIds = [...new Set(restaurants.flatMap((x) => (x.chainId ? [x.chainId] : [])))];
      let fits: Record<string, number> | null = {};
      let full = false;
      let perMeal: number | null = null;
      // Empty chainIds would mean every chain, so skip the call when nothing nearby has data.
      if (chainIds.length) {
        try {
          const res = await api.recommendations({ chainIds, limit: FIT_LIMIT });
          perMeal = res.mealCalorieLimit;
          for (const item of res.items) fits[item.chainId] = (fits[item.chainId] ?? 0) + 1;
          // On a full page a chain may have more items that were outscored (or all of them, if it's
          // missing), so only a short page gives exact counts and proves 0.
          full = res.items.length >= FIT_LIMIT;
          if (!full) for (const c of chainIds) fits[c] ??= 0;
        } catch {
          fits = null; // still show the restaurants, just without counts
        }
      }
      if (current()) setView({ kind: 'done', restaurants, fits, full, perMeal });
    } catch (err) {
      if (!current()) return;
      setView(err instanceof LocationError ? { kind: 'problem', problem: err.problem } : { kind: 'error', message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    void load(firstRadius.current);
    api.getFavorites()
      .then((r) => setSaved(Object.fromEntries(r.favorites.map((f) => [f.placeId, f.id]))))
      .catch(() => {}); // without them the stars just start empty
  }, [load]);

  function retry() {
    setView(here.current ? { kind: 'searching' } : { kind: 'locating' });
    void load(radius);
  }

  function chooseRadius(r: SearchRadius) {
    if (r === radius) return;
    setRadius(r);
    setView(here.current ? { kind: 'searching' } : { kind: 'locating' });
    void load(r);
    // Remembered for next time; the search above doesn't depend on it, so a failed save stays quiet.
    api.updatePreferences({ searchRadius: r }).then(setUser).catch(() => {});
  }

  async function toggleSaved(r: NearbyRestaurant) {
    setSaveError(null);
    const favoriteId = saved[r.placeId];
    try {
      if (favoriteId) {
        await api.removeFavorite(favoriteId);
        setSaved((s) => Object.fromEntries(Object.entries(s).filter(([placeId]) => placeId !== r.placeId)));
      } else {
        const f = await api.addFavorite({ placeId: r.placeId, label: r.name.slice(0, 50) });
        setSaved((s) => ({ ...s, [r.placeId]: f.id }));
      }
    } catch (err) {
      // 409: saved already (another tab), 404: removed already. Either way, reload the true state.
      if (err instanceof api.ApiError && (err.status === 409 || err.status === 404)) {
        const res = await api.getFavorites().catch(() => null);
        if (res) setSaved(Object.fromEntries(res.favorites.map((f) => [f.placeId, f.id])));
      } else {
        setSaveError(errorMessage(err));
      }
    }
  }

  const perMeal = view.kind === 'done' ? view.perMeal : null;

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-[28px] leading-[1.2] font-bold">Restaurants near you</h1>
            <p className="mt-2 text-base text-text-muted">
              Within {radius} miles.{perMeal !== null && ` Up to ${formatCalories(perMeal)} cal per meal.`}
            </p>
          </div>
          <div role="group" aria-label="Search radius" className="flex flex-wrap gap-2">
            {RADII.map((r) => (
              <button
                key={r}
                type="button"
                aria-pressed={r === radius}
                onClick={() => chooseRadius(r)}
                className={`h-11 rounded-full border px-4 text-base font-medium ${
                  r === radius ? 'border-primary bg-primary text-on-primary' : 'border-border-input bg-bg text-text hover:bg-surface'
                }`}
              >
                {r} mi
              </button>
            ))}
          </div>
        </div>

        {saveError && <Banner message={saveError} />}

        {view.kind === 'locating' && <StatusMessage loading message="Finding where you are…" />}
        {view.kind === 'searching' && (
          <StatusMessage loading message="Finding restaurants near you… This can take up to a minute." />
        )}
        {view.kind === 'problem' && <LocationHelp problem={view.problem} onRetry={retry} />}
        {view.kind === 'error' && <Banner message={view.message} actionLabel="Try again" onAction={retry} />}
        {view.kind === 'done' &&
          (view.restaurants.length === 0 ? (
            <StatusMessage
              title="No restaurants found"
              message={radius < 20 ? `Nothing within ${radius} mi. Try a bigger radius.` : `Nothing within ${radius} mi.`}
            />
          ) : (
            <ul className="grid gap-3 md:grid-cols-2">
              {view.restaurants.map((r) => (
                <li key={r.placeId}>
                  <RestaurantCard
                    restaurant={r}
                    fits={r.chainId === null ? null : view.fits?.[r.chainId] ?? null}
                    atLeast={view.full}
                    saved={!!saved[r.placeId]}
                    onToggleSaved={() => toggleSaved(r)}
                  />
                </li>
              ))}
            </ul>
          ))}
      </div>
    </AppShell>
  );
}

// Spec section 4, Restaurant card: name, distance, address when there is one, and the fit badge. Only cards
// with something that fits open Best picks for that chain; "No nutrition data" isn't a link.
function RestaurantCard({
  restaurant: r, fits, atLeast, saved, onToggleSaved,
}: {
  restaurant: NearbyRestaurant;
  fits: number | null; // null: no nutrition data, or the count failed or is unknown
  atLeast: boolean;
  saved: boolean;
  onToggleSaved: () => void;
}) {
  const hasData = r.chainId !== null;
  const linked = hasData && (fits === null || fits > 0);
  let badge = null;
  if (!hasData) badge = <Pill look="neutral">No nutrition data</Pill>;
  else if (fits === 0) badge = <Pill look="neutral">Nothing fits your goal</Pill>;
  else if (fits !== null) {
    badge = (
      <Pill look="great" icon="check">
        {fits}
        {atLeast ? '+' : ''} {fits === 1 && !atLeast ? 'option fits' : 'options fit'} your goal
      </Pill>
    );
  }

  return (
    // The name link stretches over the whole card (after:inset-0); the save button sits above it.
    <article
      className={`relative flex h-full flex-col gap-2 rounded-(--radius-card) border border-border bg-bg p-5 shadow-[0_1px_2px_rgba(0,0,0,0.06)] ${
        linked ? 'hover:border-border-input' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-xl leading-[1.3] font-semibold">
          {linked ? (
            <Link
              to={`/picks?${new URLSearchParams({ chain: r.chainId!, name: r.name })}`}
              className="after:absolute after:inset-0 after:rounded-(--radius-card) hover:underline"
            >
              {r.name}
            </Link>
          ) : (
            r.name
          )}
        </h2>
        <span className="pt-1 text-sm whitespace-nowrap text-text-muted tabular-nums">{r.distanceMiles.toFixed(1)} mi</span>
      </div>
      {r.address && (
        <p className="flex items-start gap-1.5 text-sm text-text-muted">
          <svg className="mt-0.5 size-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          {r.address}
        </p>
      )}
      <div className="mt-auto flex items-center justify-between gap-3 pt-1">
        <div>{badge}</div>
        <button
          type="button"
          onClick={onToggleSaved}
          aria-pressed={saved}
          aria-label={saved ? `Saved: ${r.name}. Remove from saved` : `Save ${r.name}`}
          className="relative z-10 inline-flex items-center gap-1.5 rounded-(--radius-input) px-2 py-1.5 text-sm font-semibold text-primary hover:bg-surface"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l2.6 5.6 6 .6-4.5 4 1.3 6-5.4-3.2-5.4 3.2 1.3-6-4.5-4 6-.6Z" />
          </svg>
          {saved ? 'Saved' : 'Save'}
        </button>
      </div>
    </article>
  );
}

// What to do when there's no location, one message per problem (same wording as mobile where it applies).
function LocationHelp({ problem, onRetry }: { problem: LocationProblem; onRetry: () => void }) {
  const [title, message] = {
    denied: [
      'Location is blocked',
      "Menu Macro Fitter uses your location only to find restaurants near you. It isn't saved. Allow location for this site in your browser (the icon next to the address), then try again.",
    ],
    unavailable: ["Can't find your location", 'Check that location is on for your device, then try again.'],
    unsupported: ["Location isn't available", "This browser can't share your location with this page."],
  }[problem];
  return (
    <StatusMessage title={title} message={`${message} Best picks and Search work without it.`}>
      {problem !== 'unsupported' && <Button onClick={onRetry}>Try again</Button>}
      <Link to="/picks" className="flex h-12 items-center justify-center rounded-(--radius-input) border border-border-input px-4 font-semibold hover:bg-surface">
        See best picks
      </Link>
    </StatusMessage>
  );
}
