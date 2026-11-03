import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import * as api from '../api';
import AppShell from '../components/AppShell';
import Banner from '../components/Banner';
import StatusMessage from '../components/StatusMessage';
import { errorMessage } from '../errors';
import type { Favorite } from '../types/api';

const savedOn = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

// #34, favorites: GET/DELETE /favorites. A favorite stores only the place ID and a label (spec N4: no
// address or location), so this page lists labels; saving and opening a place happens on Nearby.
export default function FavoritesPage() {
  const [favorites, setFavorites] = useState<Favorite[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    api.getFavorites()
      .then((r) => setFavorites(r.favorites))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  async function remove(f: Favorite) {
    setRemoving(f.id);
    setError(null);
    try {
      await api.removeFavorite(f.id);
    } catch (err) {
      // 404: already gone (another tab), which is what we wanted.
      if (!(err instanceof api.ApiError && err.status === 404)) {
        setError(errorMessage(err));
        setRemoving(null);
        return;
      }
    }
    setFavorites((list) => list?.filter((x) => x.id !== f.id) ?? null);
    setRemoving(null);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-[28px] leading-[1.2] font-bold">Saved restaurants</h1>
          <p className="mt-2 text-base text-text-muted">
            Places you saved on Nearby. When one is in range, its card there shows "Saved".
          </p>
        </div>
        {error && <Banner message={error} />}
        {!favorites ? (
          !error && <StatusMessage loading message="Loading your saved restaurants…" />
        ) : favorites.length === 0 ? (
          <StatusMessage title="Nothing saved yet" message="Tap Save on a restaurant in Nearby to keep it here.">
            <Link to="/home" className="flex h-12 items-center justify-center rounded-(--radius-input) bg-primary px-4 font-semibold text-on-primary hover:bg-primary-hover">
              Find restaurants near me
            </Link>
          </StatusMessage>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-(--radius-card) border border-border sm:max-w-[640px]">
            {favorites.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-4 px-5 py-4">
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{f.label ?? 'Saved restaurant'}</p>
                  <p className="text-sm text-text-muted">Saved {savedOn(f.createdAt)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(f)}
                  disabled={removing === f.id}
                  aria-label={`Remove ${f.label ?? 'saved restaurant'}`}
                  className="shrink-0 rounded-(--radius-input) px-3 py-2 text-sm font-semibold text-error hover:bg-error-bg disabled:opacity-60"
                >
                  {removing === f.id ? 'Removing…' : 'Remove'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
