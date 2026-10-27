export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
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
    const data = await res.json().catch(() => ({})); // non-JSON error page (proxy 502) still gets the fallback message
    throw new ApiError(data.error ?? 'Request failed', res.status);
  }
  return res.json().catch(() => {
    throw new ApiError('Invalid response', res.status);
  });
}
