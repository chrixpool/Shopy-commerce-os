import { auth } from './auth';
import { normalizeCurrencyCode, type WorkspaceSettings } from './currency';
import { cache } from 'react';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const API_INTERNAL_SECRET = process.env.API_INTERNAL_SECRET;
const getApiSession = cache(auth);

export type ApiLoadState = 'ready' | 'unauthorized' | 'timeout' | 'error';

export interface ApiLoadResult<T> {
  data: T;
  state: ApiLoadState;
  message?: string;
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly code: 'unauthorized' | 'timeout' | 'error' = 'error',
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function apiUrl(path: string) {
  const base = API_URL.replace(/\/$/, '');
  if (base.endsWith('/api/v1') && path.startsWith('/api/v1')) {
    return `${base}${path.slice('/api/v1'.length)}`;
  }
  return `${base}${path}`;
}

async function requestApi<T>(
  path: string,
  init: RequestInit,
  options: { timeoutMs: number; attempts: number },
): Promise<T> {
  if (!API_INTERNAL_SECRET) {
    throw new ApiRequestError(
      'The workspace API connection is not configured for this deployment.',
      503,
      'error',
    );
  }
  const session = await getApiSession();
  if (!session?.user) {
    throw new ApiRequestError(
      'Your session is no longer valid. Sign in again.',
      401,
      'unauthorized',
    );
  }

  const requestId = `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  const headers = {
    'Content-Type': 'application/json',
    'x-internal-secret': API_INTERNAL_SECRET,
    'x-user-id': session.user.id,
    'x-user-name': session.user.name ?? '',
    'x-user-email': session.user.email ?? '',
    'x-user-role': session.user.role,
    'x-organization-id': session.user.organizationId,
    'x-request-id': requestId,
    ...init.headers,
  };

  let lastError: unknown;

  for (let attempt = 0; attempt < options.attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    const startedAt = Date.now();

    try {
      const response = await fetch(apiUrl(path), {
        ...init,
        cache: 'no-store',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const durationMs = Date.now() - startedAt;
        const responseMessage = await safeApiErrorMessage(response);
        console.warn(
          JSON.stringify({
            event: 'api_request_failed',
            requestId,
            path,
            status: response.status,
            durationMs,
          }),
        );
        if (response.status === 401 || response.status === 403) {
          throw new ApiRequestError(
            'Your session is no longer valid. Sign in again.',
            response.status,
            'unauthorized',
          );
        }
        throw new ApiRequestError(
          responseMessage ?? `The workspace request failed (${response.status}).`,
          response.status,
        );
      }

      const durationMs = Date.now() - startedAt;
      if (durationMs > 1500) {
        console.warn(
          JSON.stringify({
            event: 'slow_api_request',
            requestId,
            path,
            status: response.status,
            durationMs,
          }),
        );
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (error instanceof ApiRequestError && error.code === 'unauthorized') throw error;
      if (attempt < options.attempts - 1) await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  if (lastError instanceof ApiRequestError) throw lastError;
  if (lastError instanceof Error && lastError.name === 'AbortError') {
    throw new ApiRequestError(
      'The workspace API is starting. This usually takes a few seconds.',
      undefined,
      'timeout',
    );
  }
  throw new ApiRequestError('The workspace service could not be reached.', undefined, 'error');
}

async function safeApiErrorMessage(response: Response) {
  try {
    const payload = (await response.json()) as { message?: unknown };
    const message = Array.isArray(payload.message) ? payload.message[0] : payload.message;
    if (typeof message !== 'string' || !message.trim() || message.length > 240) return null;
    if (
      /bearer\s+\S+/i.test(message) ||
      /(?:token|secret|password|credential|authorization|cookie)\s*[:=]\s*\S+/i.test(message)
    ) {
      return null;
    }
    return message.trim();
  } catch {
    return null;
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = init.method?.toUpperCase() ?? 'GET';
  return requestApi<T>(path, init, {
    timeoutMs: method === 'GET' ? 15000 : 20000,
    attempts: method === 'GET' ? 2 : 1,
  });
}

export async function apiFetchState<T>(
  path: string,
  fallback: T,
  options: { timeoutMs?: number } = {},
): Promise<ApiLoadResult<T>> {
  try {
    return {
      data: await requestApi<T>(path, {}, { timeoutMs: options.timeoutMs ?? 5000, attempts: 1 }),
      state: 'ready',
    };
  } catch (error) {
    const state = error instanceof ApiRequestError ? error.code : 'error';
    return {
      data: fallback,
      state,
      message:
        error instanceof Error ? error.message : 'The workspace service could not be reached.',
    };
  }
}

export const getWorkspaceSettings = cache(async () => {
  const settings = await apiFetch<WorkspaceSettings>('/api/v1/settings/organization');
  return {
    ...settings,
    baseCurrency: normalizeCurrencyCode(settings.baseCurrency),
  };
});
