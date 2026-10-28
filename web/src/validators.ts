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
