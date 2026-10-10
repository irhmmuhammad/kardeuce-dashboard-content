import type { ApiErrorBody } from '@shared/insights';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: ApiErrorBody['error']['code'] | 'network',
    readonly status: number,
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** fetch wrapper for our /api server: JSON in, JSON out, readable errors. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    });
  } catch {
    throw new ApiError('Can’t reach the API server. Is it running? (npm run dev starts it.)', 'network', 0);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Vite answers unknown /api paths with index.html when the server isn't proxied.
    throw new ApiError('The API server isn’t answering. Start it with npm run dev.', 'network', res.status);
  }
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    if (err) {
      const wait = err.retryAfter ? ` Try again in ${Math.ceil(err.retryAfter / 60)} min.` : '';
      throw new ApiError(`${err.message}${wait}`, err.code, res.status, err.retryAfter);
    }
    throw new ApiError(`Request failed (${res.status}).`, 'internal', res.status);
  }
  return body as T;
}
