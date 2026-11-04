import type {
  Category, MenuItemFields, NewChainPayload, Submission, SubmissionFlag, SubmissionKind, SubmissionStatus,
} from './types/api';
import { formatCalories, formatGrams } from './units';

export const CATEGORIES: { value: Category; label: string }[] = [
  { value: 'entree', label: 'Entree' },
  { value: 'side', label: 'Side' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'salad', label: 'Salad' },
  { value: 'drink', label: 'Drink' },
  { value: 'dessert', label: 'Dessert' },
];

export const KIND_LABELS: Record<SubmissionKind, string> = {
  edit_item: 'Correction',
  new_item: 'New item',
  new_chain: 'New restaurant',
};

// Pill look and wording per status. Text always says it, so color isn't the only signal.
export const STATUS_LABELS: Record<SubmissionStatus, { label: string; look: 'great' | 'ok' | 'neutral' | 'over' }> = {
  auto_applied: { label: 'Applied', look: 'great' },
  pending: { label: 'In review', look: 'ok' },
  approved: { label: 'Approved', look: 'great' },
  rejected: { label: 'Rejected', look: 'over' },
  reverted: { label: 'Reverted', look: 'neutral' },
};

export const FLAG_LABELS: Record<SubmissionFlag, string> = {
  new_chain: 'New restaurant',
  verified_item: 'Verified item',
  renamed: 'Renamed',
  large_change: 'Large change',
  macros_mismatch: "Macros don't add up",
  new_account: 'New account',
  untrusted_user: 'Untrusted user',
  url_in_name: 'Link in name',
};

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  category: 'Category',
  calories: 'Calories',
  proteinG: 'Protein',
  carbsG: 'Carbs',
  fatG: 'Fat',
  nutritionSourceUrl: 'Nutrition page',
  alternateNames: 'Other names',
};
const ITEM_FIELDS = ['name', 'category', 'calories', 'proteinG', 'carbsG', 'fatG'] as const;

function show(field: string, v: unknown) {
  if (v === undefined) return '—';
  if (v === null) return 'unknown';
  if (field === 'calories') return `${formatCalories(v as number)} cal`;
  if (field.endsWith('G')) return `${formatGrams(v as number)} g`;
  if (field === 'category') return CATEGORIES.find((c) => c.value === v)?.label ?? String(v);
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  return String(v);
}

// One row per field the submission sets: label, value before (edits once applied) and the proposed value.
// A pending edit has no "before" yet (the server records it when the change is applied).
export function changeRows(s: Pick<Submission, 'kind' | 'payload' | 'before'>) {
  const fields = s.kind === 'new_chain' ? ['name', 'nutritionSourceUrl', 'alternateNames'] : ITEM_FIELDS;
  const payload = s.payload as Record<string, unknown>;
  const before = s.before as Record<string, unknown> | null;
  return fields
    .filter((f) => f in payload)
    .map((f) => ({
      field: f,
      label: FIELD_LABELS[f],
      before: s.kind === 'edit_item' && before ? show(f, before[f]) : null,
      proposed: show(f, payload[f]),
    }));
}

// The submission's headline: the name it adds, or the item it renames.
export function submissionTitle(s: Pick<Submission, 'kind' | 'payload' | 'before'>) {
  const p = s.payload as Partial<MenuItemFields> & Partial<NewChainPayload>;
  if (s.kind !== 'edit_item') return p.name ?? '';
  const oldName = (s.before as Partial<MenuItemFields> | null)?.name;
  if (oldName) return oldName;
  return p.name ? `Rename to ${p.name}` : 'Menu item';
}

export const formatWhen = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
