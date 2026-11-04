import { useRef, useState, type FormEvent } from 'react';
import * as api from '../api';
import { formatDay } from '../dates';
import { errorMessage } from '../errors';
import type { MealLogEntry, PhotoItem } from '../types/api';
import { formatCalories } from '../units';
import Banner from './Banner';
import Button from './Button';
import Dialog from './Dialog';
import Pill from './Pill';
import TextField from './TextField';

const MAX_SIDE = 1024;
const QUALITY = 0.8;

// Shrinks the photo so it fits the API's 3,000,000-character limit and uploads fast: longest side
// 1024 px, JPEG 0.8, plain base64 (no "data:" prefix).
async function toJpegBase64(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', QUALITY).split(',')[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

// The API's photo errors in words that say what to do next (contract, Photo analysis).
function photoError(err: unknown) {
  if (err instanceof api.ApiError) {
    if (err.status === 429) return "You've used today's photo analyses. Try again tomorrow, or add food by search.";
    if (err.status === 503) return "Photo logging isn't available right now. Add food by search instead.";
    if (err.status === 413) return 'That photo is too large. Try a smaller one.';
    if (err.status === 502) return "Couldn't analyze that photo. Try again, or add food by search.";
  }
  if (err instanceof api.ApiError || err instanceof TypeError) return errorMessage(err);
  return "Couldn't read that image. Try a JPEG or PNG photo.";
}

interface Row {
  key: number;
  base: PhotoItem;
  editing: boolean;
  servings: string;
  name: string;
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

const text = (n: number | null) => (n === null ? '' : String(n));
const macro = (s: string) => (s.trim() === '' ? null : Number(s));
const toRow = (base: PhotoItem, key: number): Row => ({
  key, base, editing: false, servings: String(base.servings), name: base.name,
  calories: String(base.calories), proteinG: text(base.proteinG), carbsG: text(base.carbsG), fatG: text(base.fatG),
});

// Edited name or macros make a matched item custom (contract: a matched item may change only servings).
function changed(r: Row) {
  const b = r.base;
  return (
    r.name.trim() !== b.name || Number(r.calories) !== b.calories ||
    macro(r.proteinG) !== b.proteinG || macro(r.carbsG) !== b.carbsG || macro(r.fatG) !== b.fatG
  );
}

function rowError(r: Row) {
  const s = Number(r.servings);
  if (r.servings.trim() === '' || !Number.isFinite(s) || s < 0.25 || s > 10) return 'Servings: 0.25 to 10';
  if (!r.name.trim() || r.name.trim().length > 150) return 'Name: 1 to 150 characters';
  const c = Number(r.calories);
  if (r.calories.trim() === '' || !Number.isFinite(c) || c < 0 || c > 5000) return 'Calories: 0 to 5000';
  for (const m of [r.proteinG, r.carbsG, r.fatG]) {
    if (m.trim() !== '' && (!Number.isFinite(Number(m)) || Number(m) < 0)) return 'Macros: 0 or more grams, or blank if unknown';
  }
  return null;
}

function toEntry(r: Row, date: string): MealLogEntry {
  const servings = Number(r.servings);
  if (r.base.menuItemId && !changed(r)) return { date, menuItemId: r.base.menuItemId, servings, source: 'photo' };
  return {
    date, servings, source: 'photo', name: r.name.trim(), chainName: r.base.chainName,
    calories: Number(r.calories), proteinG: macro(r.proteinG), carbsG: macro(r.carbsG), fatG: macro(r.fatG),
  };
}

const CONFIDENCE = { high: 'great', medium: 'ok', low: 'neutral' } as const;

// #116: "Log from photo" on the tracker. Pick or take a photo, check what was recognized, then log it.
// Nothing is logged until "Log"; closing the dialog drops the results.
export default function PhotoLog({ date, onLogged }: { date: string; onLogged: (count: number) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<'idle' | 'analyzing' | 'confirm' | 'empty' | 'error'>('idle');
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  const [logging, setLogging] = useState(false);
  const open = phase !== 'idle';

  async function pick(file: File | undefined) {
    if (!file) return;
    setPhase('analyzing');
    setError(null);
    setTried(false);
    try {
      const imageBase64 = await toJpegBase64(file);
      const { items } = await api.analyzePhoto({ imageBase64, mediaType: 'image/jpeg' });
      setRows(items.map(toRow));
      setPhase(items.length ? 'confirm' : 'empty');
    } catch (err) {
      setError(photoError(err));
      setPhase('error');
    }
  }

  function close() {
    setPhase('idle');
    setRows([]);
    if (input.current) input.current.value = ''; // the same photo can be picked again
  }

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function log(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (rows.some(rowError)) return;
    setLogging(true);
    setError(null);
    try {
      await api.addMealLogs({ entries: rows.map((r) => toEntry(r, date)) });
      onLogged(rows.length);
      close();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLogging(false);
    }
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => pick(e.target.files?.[0])}
      />
      <Button variant="secondary" className="sm:w-auto sm:px-5" onClick={() => input.current?.click()}>
        <svg className="mr-2 size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
          <circle cx="12" cy="13" r="3.5" />
        </svg>
        Log from photo
      </Button>

      <Dialog open={open} onClose={close} title="Log from photo">
        {phase === 'analyzing' && (
          <div role="status" className="flex flex-col items-center gap-3 py-8 text-center">
            <svg className="size-8 animate-spin text-primary" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <p className="text-base text-text-muted">Looking at your meal…</p>
          </div>
        )}
        {phase === 'error' && (
          <>
            <Banner message={error!} />
            <Button variant="secondary" onClick={close}>Close</Button>
          </>
        )}
        {phase === 'empty' && (
          <>
            <div className="flex flex-col gap-1 py-4 text-center">
              <p className="text-xl font-semibold">No food recognized</p>
              <p className="text-base text-text-muted">Try a closer, well-lit photo of the meal, or add it by search.</p>
            </div>
            <Button variant="secondary" onClick={close}>Close</Button>
          </>
        )}
        {phase === 'confirm' && (
          <form onSubmit={log} noValidate className="flex flex-col gap-4">
            <p className="text-sm text-text-muted">
              Check what we found before it goes in your log for {formatDay(date)}. Fix servings, remove anything wrong, or
              edit the numbers.
            </p>
            {error && <Banner message={error} />}
            {rows.length === 0 ? (
              <p className="text-base text-text-muted">Everything was removed. Close to cancel, or pick another photo.</p>
            ) : (
              <ul className="flex flex-col">
                {rows.map((r) => {
                  const err = tried ? rowError(r) : null;
                  const kcal = Number(r.calories) * Number(r.servings);
                  return (
                    <li key={r.key} className="flex flex-col gap-3 border-b border-border py-3 last:border-b-0">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col">
                          <span className="text-base font-semibold">{r.name || r.base.name}</span>
                          <span className="text-sm text-text-muted">
                            {r.base.chainName ?? 'Not on our menus'}
                            {r.base.menuItemId && changed(r) && ' · edited, logged as custom'}
                          </span>
                        </div>
                        <Pill look={CONFIDENCE[r.base.confidence]}>{r.base.confidence} confidence</Pill>
                      </div>
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="w-[120px]">
                          <TextField label="Servings" type="number" inputMode="decimal" min={0.25} max={10} step={0.25} value={r.servings} onChange={(v) => update(r.key, { servings: v })} />
                        </div>
                        <span className="pb-3 text-sm text-text-muted tabular-nums">
                          {Number.isFinite(kcal) ? `${formatCalories(Math.round(kcal))} cal` : ''}
                        </span>
                        <div className="ml-auto flex gap-2 pb-1">
                          <button type="button" onClick={() => update(r.key, { editing: !r.editing })} aria-expanded={r.editing} className="rounded-(--radius-input) px-3 py-2 text-sm font-semibold text-primary hover:bg-surface">
                            {r.editing ? 'Done editing' : 'Edit'}
                          </button>
                          <button type="button" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label={`Remove ${r.name}`} className="rounded-(--radius-input) border border-border-input px-3 py-2 text-sm font-semibold hover:bg-surface">
                            Remove
                          </button>
                        </div>
                      </div>
                      {r.editing && (
                        <div className="grid grid-cols-2 gap-3 rounded-(--radius-input) bg-surface p-3 sm:grid-cols-4">
                          <div className="col-span-2 sm:col-span-4">
                            <TextField label="Name" value={r.name} maxLength={150} onChange={(v) => update(r.key, { name: v })} />
                          </div>
                          <TextField label="Calories" type="number" min={0} suffix="cal" value={r.calories} onChange={(v) => update(r.key, { calories: v })} />
                          <TextField label="Protein" type="number" min={0} step="any" suffix="g" placeholder="?" value={r.proteinG} onChange={(v) => update(r.key, { proteinG: v })} />
                          <TextField label="Carbs" type="number" min={0} step="any" suffix="g" placeholder="?" value={r.carbsG} onChange={(v) => update(r.key, { carbsG: v })} />
                          <TextField label="Fat" type="number" min={0} step="any" suffix="g" placeholder="?" value={r.fatG} onChange={(v) => update(r.key, { fatG: v })} />
                        </div>
                      )}
                      {err && <p className="text-sm text-error">{err}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" variant="secondary" className="flex-1" onClick={close}>
                Cancel
              </Button>
              <Button type="submit" className="flex-1" loading={logging} disabled={rows.length === 0}>
                Log {rows.length} {rows.length === 1 ? 'item' : 'items'}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
