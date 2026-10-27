export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// The only place in web/ that calls fetch. Attaches the stored JWT and turns { error } into ApiError.
export async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(import.meta.env.VITE_API_URL + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({})); // non-JSON error page (proxy 502) still gets the fallback message
  if (!res.ok) throw new ApiError(data.error ?? 'Request failed', res.status);
  return data as T;
}
