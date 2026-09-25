import { logEvent } from '../devlog/devlog-store';
import { SESSION_ENDED_MESSAGE, sessionStores } from '../session/session-store';
import type { Role } from '../tab/types';

// Every path is relative (e.g. /api/v1/cab/fare-estimate) — the Vite dev server proxies
// each prefix to the right Go service, so there are no per-service base URLs here.

export class ApiError extends Error {
  code: string;
  status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  headers?: Record<string, string>;
  /** Whose session token to send. Omit for signup/login. */
  auth?: Role;
}

function withQuery(path: string, query: RequestOptions['query']): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth, headers: extraHeaders } = options;
  const url = withQuery(path, query);
  const startedAt = performance.now();

  const headers: Record<string, string> = { ...extraHeaders };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = sessionStores[auth].getState().token;
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    logEvent('error', `${method} ${url} network error`, { request: body, error: String(error) });
    throw new ApiError(0, 'NETWORK_ERROR', 'Could not reach the server.');
  }

  const elapsed = Math.round(performance.now() - startedAt);
  const json: unknown = response.status === 204 ? undefined : await response.json().catch(() => undefined);
  logEvent('http', `${method} ${url} ${response.status} ${elapsed}ms`, { request: body, headers: extraHeaders, response: json });

  if (!response.ok) {
    // go-ride-backend returns {code, message}; the kafka-consumers services return
    // {error, message}. Normalise both into ApiError.code. The Vite proxy answers with
    // an empty 5xx when a service isn't running.
    const errorBody = (json ?? {}) as { code?: string; error?: string; message?: string };
    const code = errorBody.code ?? errorBody.error ?? (response.status >= 500 ? 'SERVICE_UNAVAILABLE' : 'UNKNOWN_ERROR');
    const message =
      errorBody.message ??
      (response.status >= 500 ? 'The service is unavailable. Is it running?' : 'Something went wrong. Please try again.');

    // No refresh endpoint exists, so a 401 on an authenticated call means the token is
    // dead — clear it and let the route guard send the tab back to login.
    if (response.status === 401 && auth) {
      sessionStores[auth].getState().clearSession(SESSION_ENDED_MESSAGE);
    }

    throw new ApiError(response.status, code, message);
  }

  return json as T;
}
