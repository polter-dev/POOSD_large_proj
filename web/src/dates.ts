// Meal logs use the user's local day as YYYY-MM-DD (contract, Meal logs). Everything here works in the
// browser's local time: toISOString() would give the UTC day, which is tomorrow on a Florida evening.

const pad = (n: number) => String(n).padStart(2, '0');

export const toISODate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Noon, so a daylight-saving change can't move the date when days are added.
export function fromISODate(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export const todayISO = () => toISODate(new Date());

export function addDays(s: string, n: number) {
  const d = fromISODate(s);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

// The Monday of the Monday-Sunday week containing s.
export function mondayOf(s: string) {
  const day = fromISODate(s).getDay(); // 0 = Sunday
  return addDays(s, day === 0 ? -6 : 1 - day);
}

// "Wed, Nov 4"
export const formatDay = (s: string) =>
  fromISODate(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

// "Nov 2 – Nov 8"
export const formatRange = (from: string, to: string) => {
  const f = (s: string) => fromISODate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${f(from)} – ${f(to)}`;
};
