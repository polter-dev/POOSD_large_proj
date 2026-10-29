export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

// Called when a request that carried a token gets 401: the session expired or the token is bad.
// AuthContext sets it, logs out, and the route guards send the user to the login page.
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null) {
  onSessionExpired = fn;
}

// The only place in web/ that calls fetch. Attaches the stored JWT and turns { error } into ApiError.
export async function request<T>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(import.meta.env.VITE_API_URL + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => {
    throw new ApiError('Network error', 0); // server down, offline or CORS
  });
  if (res.status === 204) return undefined as T;
  if (!res.ok) {
    // Only with a token: a 401 from login itself is a wrong password, not an expired session.
    if (res.status === 401 && token) onSessionExpired?.();
    const data = await res.json().catch(() => ({})); // non-JSON error page (proxy 502) still gets the fallback message
    throw new ApiError(data.error ?? 'Request failed', res.status);
  }
  return res.json().catch(() => {
    throw new ApiError('Invalid response', res.status);
  });
}
