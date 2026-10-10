import type { ApiErrorBody } from '../shared/insights.ts';

export type ErrorCode = ApiErrorBody['error']['code'];

const STATUS: Record<ErrorCode, number> = {
  not_connected: 401,
  token_expired: 401,
  not_configured: 400,
  permission: 403,
  rate_limited: 429,
  platform_error: 502,
  bad_request: 400,
  internal: 500,
};

/** An error that is safe to show to the user. Never put tokens in `message`. */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly retryAfter?: number;
  /** Raw platform error code (e.g. Meta `100`), used for retry decisions. */
  readonly platformCode?: number | string;

  constructor(code: ErrorCode, message: string, opts: { retryAfter?: number; platformCode?: number | string; status?: number } = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = opts.status ?? STATUS[code];
    this.retryAfter = opts.retryAfter;
    this.platformCode = opts.platformCode;
  }

  toBody(): ApiErrorBody {
    return { error: { code: this.code, message: this.message, ...(this.retryAfter ? { retryAfter: this.retryAfter } : {}) } };
  }
}

export class RateLimitError extends ApiError {
  constructor(message: string, retryAfter = 300, platformCode?: number | string) {
    super('rate_limited', message, { retryAfter, platformCode });
    this.name = 'RateLimitError';
  }
}

/** Errors that should stop a whole sync instead of becoming a per-item warning. */
export function isFatal(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'token_expired' || err.code === 'not_connected' || err.code === 'rate_limited');
}

/** Wrap network failures (DNS, offline, TLS) into a readable ApiError. */
export async function safeFetch(platformLabel: string, url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new ApiError('platform_error', `Could not reach ${platformLabel}: ${reason}`);
  }
}

export async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 300) };
  }
}
