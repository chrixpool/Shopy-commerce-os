import { auth } from './auth';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const API_INTERNAL_SECRET = process.env.API_INTERNAL_SECRET ?? 'shopy-internal-secret';

function apiUrl(path: string) {
  const base = API_URL.replace(/\/$/, '');
  if (base.endsWith('/api/v1') && path.startsWith('/api/v1')) {
    return `${base}${path.slice('/api/v1'.length)}`;
  }
  return `${base}${path}`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Not authenticated');
  }

  const response = await fetch(apiUrl(path), {
    ...init,
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': API_INTERNAL_SECRET,
      'x-user-id': session.user.id,
      'x-user-name': session.user.name ?? '',
      'x-user-email': session.user.email ?? '',
      'x-user-role': session.user.role,
      'x-organization-id': session.user.organizationId,
      ...init.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}
