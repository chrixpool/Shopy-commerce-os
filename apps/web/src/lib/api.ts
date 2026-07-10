import { auth } from './auth';
import { normalizeCurrencyCode, type WorkspaceSettings } from './currency';
import { cache } from 'react';

const API_URL = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const API_INTERNAL_SECRET = process.env.API_INTERNAL_SECRET || 'shopy-internal-secret';
const getApiSession = cache(auth);

function apiUrl(path: string) {
  const base = API_URL.replace(/\/$/, '');
  if (base.endsWith('/api/v1') && path.startsWith('/api/v1')) {
    return `${base}${path.slice('/api/v1'.length)}`;
  }
  return `${base}${path}`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await getApiSession();
  if (!session?.user) {
    throw new Error('Not authenticated');
  }

  const headers = {
    'Content-Type': 'application/json',
    'x-internal-secret': API_INTERNAL_SECRET,
    'x-user-id': session.user.id,
    'x-user-name': session.user.name ?? '',
    'x-user-email': session.user.email ?? '',
    'x-user-role': session.user.role,
    'x-organization-id': session.user.organizationId,
    ...init.headers,
  };

  const method = init.method?.toUpperCase() ?? 'GET';
  const attempts = method === 'GET' ? 2 : 1;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    try {
      const response = await fetch(apiUrl(path), {
        ...init,
        cache: 'no-store',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      return response.json() as Promise<T>;
    } catch (error) {
      clearTimeout(timeout);
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  throw new Error(
    lastError instanceof Error && lastError.name === 'AbortError'
      ? 'Connecting to Shopy API took too long. The free API may be starting.'
      : 'Connecting to Shopy API failed. The free API may be starting.',
  );
}

export const getWorkspaceSettings = cache(async () => {
  const settings = await apiFetch<WorkspaceSettings>('/api/v1/settings/organization');
  return {
    ...settings,
    baseCurrency: normalizeCurrencyCode(settings.baseCurrency),
  };
});
