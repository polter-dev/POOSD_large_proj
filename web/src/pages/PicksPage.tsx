import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import * as api from '../api';
import AppShell from '../components/AppShell';
import Banner from '../components/Banner';
import MenuItemCard from '../components/MenuItemCard';
import SegmentedControl from '../components/SegmentedControl';
import StatusMessage from '../components/StatusMessage';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../errors';
import { greatFitCount } from '../fit';
import type { RecommendationMode, RecommendationsResponse } from '../types/api';
import { formatCalories } from '../units';

const OBJECT_ID = /^[0-9a-f]{24}$/; // anything else in ?chain= would be a 400, so it's ignored

// #34, prototype screen 08: POST /recommendations, items under the per-meal limit ranked by protein (or
// carbs) per calorie. The Best picks tab covers every chain; a restaurant card on Nearby opens it for that
// one chain (?chain=&name=). Same as mobile's PicksScreen.
export default function PicksPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const chain = params.get('chain');
  const chainId = chain && OBJECT_ID.test(chain) ? chain : null;
  const name = chainId ? params.get('name') : null;
  const [mode, setMode] = useState<RecommendationMode>(user!.preferences.recommendationMode);
  const [res, setRes] = useState<RecommendationsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0); // only the newest answer is shown when the mode is switched quickly
  const firstMode = useRef(mode);

  const load = useCallback(
    async (m: RecommendationMode) => {
      const id = ++request.current;
      try {
        const r = await api.recommendations({ mode: m, ...(chainId && { chainIds: [chainId] }) });
        if (id === request.current) setRes(r);
      } catch (err) {
        if (id === request.current) setError(errorMessage(err));
      }
    },
    [chainId],
  );

  useEffect(() => {
    void load(firstMode.current);
  }, [load]);

  function chooseMode(m: RecommendationMode) {
    if (m === mode) return;
    setMode(m);
    setRes(null);
    setError(null);
    void load(m);
  }

  function retry() {
    setError(null);
    void load(mode);
  }

  const macro = mode === 'carb' ? 'carbs' : 'protein';
  const items = res?.items ?? [];
  const great = greatFitCount(items.length);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        {name && (
          <Link to="/home" className="-mb-2 self-start text-sm font-semibold text-primary hover:underline">
            ← Restaurants near you
          </Link>
        )}
        <div>
          <h1 className="text-[28px] leading-[1.2] font-bold">{name ? `Best picks at ${name}` : 'Best picks'}</h1>
          <p className="mt-2 text-base text-text-muted">
            Ranked by {macro} per calorie{res ? `, each under ${formatCalories(res.mealCalorieLimit)} cal` : ''}.
          </p>
        </div>
        <div className="sm:w-[360px]">
          <SegmentedControl
            label="Rank by"
            options={[
              { value: 'protein', label: 'High protein' },
              { value: 'carb', label: 'High carb' },
            ]}
            value={mode}
            onChange={chooseMode}
          />
        </div>
        {error ? (
          <Banner message={error} actionLabel="Try again" onAction={retry} />
        ) : !res ? (
          <StatusMessage loading message="Finding your best picks…" />
        ) : items.length === 0 ? (
          <StatusMessage
            title="Nothing fits yet"
            message={`${name ? `Nothing at ${name} is` : 'No menu items are'} between 300 and ${formatCalories(res.mealCalorieLimit)} cal with ${macro} data.`}
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {items.map((r, i) => (
              <li key={r.id}>
                <MenuItemCard item={r} score={r.score} mode={res.mode} great={i < great} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
