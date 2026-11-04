import { useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router';
import * as api from '../api';
import { errorMessage } from '../errors';
import { CATEGORIES } from '../submissions';
import type { Category, MenuItem, MenuItemFields, MySubmission } from '../types/api';
import Banner from './Banner';
import Button from './Button';
import Dialog from './Dialog';
import SelectField from './SelectField';
import TextField from './TextField';

// #117: the three community forms. All send POST /submissions (createSubmission); the server decides
// "auto_applied" (written now) or "pending" (an admin reviews it) and the dialog says which.

type ItemTarget = { kind: 'edit'; item: MenuItem } | { kind: 'new'; chainId: string; chainName: string };

interface ItemForm {
  name: string;
  category: Category | '';
  calories: string;
  proteinG: string;
  carbsG: string;
  fatG: string;
}

const MACROS = [
  ['proteinG', 'Protein'],
  ['carbsG', 'Carbs'],
  ['fatG', 'Fat'],
] as const;

const numText = (n: number | null) => (n === null ? '' : String(n));
const isNum = (s: string) => s.trim() !== '' && Number.isFinite(Number(s));

// Same rules as the menuItems validator (backend/db/schema.js). Blank macro = unknown (null).
function validateItem(f: ItemForm) {
  const e: Partial<Record<keyof ItemForm, string>> = {};
  const name = f.name.trim();
  if (!name) e.name = 'Name is required';
  else if (name.length > 150) e.name = 'Name: 150 characters max';
  if (!f.category) e.category = 'Category is required';
  if (!isNum(f.calories) || Number(f.calories) < 0 || Number(f.calories) > 5000) e.calories = 'Calories: 0 to 5000';
  for (const [k, label] of MACROS) {
    if (f[k].trim() !== '' && (!isNum(f[k]) || Number(f[k]) < 0)) e[k] = `${label}: 0 or more grams, or blank if unknown`;
  }
  return e;
}

function toFields(f: ItemForm): MenuItemFields {
  const macro = (s: string) => (s.trim() === '' ? null : Number(s));
  return {
    name: f.name.trim(),
    category: f.category as Category,
    calories: Number(f.calories),
    proteinG: macro(f.proteinG),
    carbsG: macro(f.carbsG),
    fatG: macro(f.fatG),
  };
}

// What the user sees once the server has answered.
function Result({ submission, onClose }: { submission: MySubmission; onClose: () => void }) {
  const applied = submission.status === 'auto_applied';
  return (
    <div className="flex flex-col gap-4">
      <Banner
        info
        message={
          applied
            ? 'Applied. Thanks! Your change is live now.'
            : 'Sent for review. An admin will check it, and you can follow it under My submissions.'
        }
      />
      <div className="flex flex-col gap-3 sm:flex-row">
        <Link
          to="/submissions"
          className="flex h-12 flex-1 items-center justify-center rounded-(--radius-input) border border-border-input px-4 font-semibold hover:bg-surface"
        >
          My submissions
        </Link>
        <Button className="flex-1" onClick={onClose}>
          Done
        </Button>
      </div>
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MySubmission | null>(null);
  async function send(body: Parameters<typeof api.createSubmission>[0]) {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.createSubmission(body));
    } catch (err) {
      setError(errorMessage(err)); // 409 / 429 messages are written for users: shown as-is
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, setError, result, send };
}

// "Suggest a correction" (prefilled, sends only the changed fields) and "Add item" (to a known chain).
export function ItemDialog({ target, open, onClose }: { target: ItemTarget; open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={target.kind === 'edit' ? 'Suggest a correction' : `Add an item to ${target.chainName}`}
    >
      {/* Mounted only while open, so each opening starts from the item's current values. */}
      {open && <ItemFormBody target={target} onClose={onClose} />}
    </Dialog>
  );
}

function ItemFormBody({ target, onClose }: { target: ItemTarget; onClose: () => void }) {
  const initial: ItemForm =
    target.kind === 'edit'
      ? {
          name: target.item.name,
          category: target.item.category,
          calories: String(target.item.calories),
          proteinG: numText(target.item.proteinG),
          carbsG: numText(target.item.carbsG),
          fatG: numText(target.item.fatG),
        }
      : { name: '', category: '', calories: '', proteinG: '', carbsG: '', fatG: '' };
  const [form, setForm] = useState(initial);
  const [tried, setTried] = useState(false);
  const { busy, error, setError, result, send } = useSubmit();
  const errors = tried ? validateItem(form) : {};
  const set = (k: keyof ItemForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  if (result) return <Result submission={result} onClose={onClose} />;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (Object.keys(validateItem(form)).length) return;
    const fields = toFields(form);
    if (target.kind === 'new') return void send({ kind: 'new_item', targetId: target.chainId, payload: fields });

    const changed = Object.fromEntries(
      (Object.keys(fields) as (keyof MenuItemFields)[])
        .filter((k) => fields[k] !== target.item[k])
        .map((k) => [k, fields[k]]),
    ) as Partial<MenuItemFields>;
    if (!Object.keys(changed).length) return setError('Change at least one field to suggest a correction.');
    void send({ kind: 'edit_item', targetId: target.item.id, payload: changed });
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      {target.kind === 'edit' && (
        <p className="text-sm text-text-muted">
          {target.item.chainName}. Fix what's wrong; only the fields you change are sent. Leave a macro blank if it's
          unknown.
        </p>
      )}
      {error && <Banner message={error} />}
      <TextField label="Name" value={form.name} onChange={set('name')} maxLength={150} error={errors.name} />
      <SelectField
        label="Category"
        placeholder="Pick a category"
        options={CATEGORIES}
        value={form.category}
        onChange={set('category')}
        error={errors.category}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <TextField label="Calories" type="number" inputMode="numeric" min={0} max={5000} suffix="cal" value={form.calories} onChange={set('calories')} error={errors.calories} />
        {MACROS.map(([k, label]) => (
          <TextField
            key={k}
            label={label}
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            suffix="g"
            placeholder="?"
            value={form[k]}
            onChange={set(k)}
            error={errors[k]}
          />
        ))}
      </div>
      <Button type="submit" loading={busy}>
        {target.kind === 'edit' ? 'Send correction' : 'Add item'}
      </Button>
    </form>
  );
}

// "Add restaurant": name, the chain's published nutrition page, and other names it goes by.
export function ChainDialog({ open, onClose, initialName = '' }: { open: boolean; onClose: () => void; initialName?: string }) {
  return (
    <Dialog open={open} onClose={onClose} title="Add a restaurant">
      {open && <ChainFormBody initialName={initialName} onClose={onClose} />}
    </Dialog>
  );
}

function ChainFormBody({ initialName, onClose }: { initialName: string; onClose: () => void }) {
  const [name, setName] = useState(initialName);
  const [url, setUrl] = useState('');
  const [alts, setAlts] = useState('');
  const [tried, setTried] = useState(false);
  const { busy, error, result, send } = useSubmit();

  const altList = alts.split(',').map((s) => s.trim()).filter(Boolean);
  const errs = {
    name: !name.trim() ? 'Name is required' : name.trim().length > 100 ? 'Name: 100 characters max' : null,
    url: !/^https:\/\/\S+$/.test(url.trim()) ? 'Nutrition page: a link starting with https://' : null,
    alts:
      altList.length > 10 ? 'Other names: 10 at most' : altList.some((a) => a.length > 100) ? 'Other names: 100 characters each' : null,
  };

  if (result) return <Result submission={result} onClose={onClose} />;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (errs.name || errs.url || errs.alts) return;
    void send({
      kind: 'new_chain',
      targetId: null,
      payload: { name: name.trim(), nutritionSourceUrl: url.trim(), ...(altList.length ? { alternateNames: altList } : {}) },
    });
  }

  const show = (m: string | null) => (tried ? m : null);
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="text-sm text-text-muted">New restaurants are always checked by an admin before they show up.</p>
      {error && <Banner message={error} />}
      <TextField label="Restaurant name" value={name} onChange={setName} maxLength={100} error={show(errs.name)} />
      <TextField
        label="Nutrition page"
        type="url"
        placeholder="https://"
        value={url}
        onChange={setUrl}
        error={show(errs.url)}
      />
      <TextField
        label="Other names (optional)"
        placeholder="Comma separated, like CFA, Chick fil A"
        value={alts}
        onChange={setAlts}
        error={show(errs.alts)}
      />
      <Button type="submit" loading={busy}>
        Send for review
      </Button>
    </form>
  );
}

// A small text button that opens one of the dialogs (menu item cards, restaurant cards, page headers).
export function ContributeButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative z-10 rounded-(--radius-input) px-2 py-1.5 text-sm font-semibold text-primary hover:bg-surface"
    >
      {children}
    </button>
  );
}
