import { useEffect, useRef, useState, type FormEvent } from 'react';
import * as api from '../api';
import AppShell from '../components/AppShell';
import Banner from '../components/Banner';
import Button from '../components/Button';
import MenuItemCard from '../components/MenuItemCard';
import StatusMessage from '../components/StatusMessage';
import { errorMessage } from '../errors';
import type { MenuItem } from '../types/api';

const PAGE = 20;
const DEBOUNCE_MS = 250;
// Same rules as the server's normalize() (backend/src/utils/normalize.js): a query with nothing left after
// it would be a 400 (so "ø" isn't searchable, but "&" is: it becomes "and").
const searchable = (q: string) =>
  q
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim() !== '';

interface Results {
  query: string;
  items: MenuItem[];
  total: number;
}

// #34, the Search tab: GET /menu-items/search by item name, updating as you type (debounced) and 20 at a
// time with "Show more". No score and no fit pill: search isn't ranked by goal (spec, Menu item card).
export default function SearchPage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0); // a slow answer for an older query never replaces a newer one
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  async function search(query: string, more = false) {
    const id = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchMenuItems(query, PAGE, more && results ? results.items.length : 0);
      if (id !== request.current) return;
      setResults((prev) =>
        more && prev ? { ...prev, items: [...prev.items, ...res.items], total: res.total } : { query, items: res.items, total: res.total },
      );
    } catch (err) {
      if (id === request.current) setError(errorMessage(err));
    } finally {
      if (id === request.current) setLoading(false);
    }
  }

  function change(v: string) {
    setQ(v);
    clearTimeout(timer.current);
    const query = v.trim();
    if (!searchable(query)) {
      request.current++; // drop anything still in flight
      setResults(null);
      setLoading(false);
      setError(null);
      return;
    }
    timer.current = setTimeout(() => void search(query), DEBOUNCE_MS);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    clearTimeout(timer.current);
    const query = q.trim();
    if (searchable(query)) void search(query);
  }

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-[28px] leading-[1.2] font-bold">Search</h1>
          <p className="mt-2 text-base text-text-muted">Every restaurant's menu, by item name.</p>
        </div>
        <form role="search" onSubmit={submit} className="relative sm:max-w-[560px]">
          <label htmlFor="menu-search" className="sr-only">
            Search menu items
          </label>
          <svg className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            id="menu-search"
            type="search"
            value={q}
            maxLength={100}
            autoComplete="off"
            placeholder='Try "chicken" or "salad"'
            onChange={(e) => change(e.target.value)}
            className="h-12 w-full rounded-(--radius-input) border border-border-input bg-bg pr-3 pl-10 text-base focus:border-primary focus:outline-1 focus:outline-offset-0 focus:outline-primary"
          />
        </form>
        {error && <Banner message={error} />}
        {!results ? (
          loading ? (
            <StatusMessage loading message="Searching…" />
          ) : (
            !error && <StatusMessage message={'Search every restaurant\'s menu by item name, like "chicken" or "salad".'} />
          )
        ) : results.items.length === 0 ? (
          <StatusMessage title="No matches" message={`No menu items match "${results.query}".`} />
        ) : (
          <>
            <p className="-mb-3 text-sm text-text-muted" aria-live="polite">
              {results.total} {results.total === 1 ? 'result' : 'results'} for "{results.query}"
            </p>
            <ul className="grid gap-3 md:grid-cols-2">
              {results.items.map((item) => (
                <li key={item.id}>
                  <MenuItemCard item={item} />
                </li>
              ))}
            </ul>
            {results.items.length < results.total && (
              <Button variant="secondary" className="sm:w-[240px]" loading={loading} onClick={() => search(results.query, true)}>
                Show more
              </Button>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
