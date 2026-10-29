// Client checks with the same rules as the server (docs/api-contract.md, "Validation").
// Messages are from docs/design-spec.md section 5. Each returns null when the value is fine.
// Same rules as mobile/lib/validators.dart.

const USERNAME = /^[a-z0-9_.]{3,30}$/;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const validateFirstName = (v: string) => name(v, 'First name');
export const validateLastName = (v: string) => name(v, 'Last name');

function name(v: string, label: string) {
  const s = v.trim();
  if (!s) return `${label} is required`;
  return s.length > 50 ? `${label}: 50 characters max` : null;
}

export const validateUsername = (v: string) =>
  USERNAME.test(normalizeLower(v)) ? null : 'Username: 3 to 30 letters, numbers, _ or .';

export function validateEmail(v: string) {
  const s = normalizeLower(v);
  return EMAIL.test(s) && s.length <= 254 ? null : 'Email: enter a valid address';
}

export const validatePassword = (v: string) => (v.length >= 8 ? null : 'Password: at least 8 characters');

// The server trims and lowercases email and username before storing or comparing.
export const normalizeLower = (v: string) => v.trim().toLowerCase();

// Profile (contract "Validation"). The form shows the user's units, so the limits are given in them;
// the metric ones are rounded inward so the converted value always passes the server's 36-96 in / 50-700 lb.

// A number typed into a text field, or null when it isn't one.
export function parseNumber(v: string) {
  const s = v.trim();
  return s && Number.isFinite(Number(s)) ? Number(s) : null;
}

export function validateHeight(heightIn: number | null, metric: boolean) {
  if (heightIn !== null && heightIn >= 36 && heightIn <= 96) return null;
  return metric ? 'Height: 92 to 243 cm' : 'Height: 3 ft to 8 ft';
}

export function validateWeight(weightLb: number | null, metric: boolean) {
  if (weightLb !== null && weightLb >= 50 && weightLb <= 700) return null;
  return metric ? 'Weight: 23 to 317 kg' : 'Weight: 50 to 700 lb';
}

// Same rule and messages as the server: a real YYYY-MM-DD date, age 18-119 in whole years (UTC).
export function validateBirthDate(v: string, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  const date = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (!date || date.toISOString().slice(0, 10) !== v) return 'Birth date is required';
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const month = now.getUTCMonth() - date.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < date.getUTCDate())) age -= 1;
  if (age < 18) return 'Birth date: you must be 18 or older';
  if (age > 119) return 'Birth date: check the year';
  return null;
}

export const validateChoice = (v: string, label: string) => (v ? null : `${label}: choose one`);
