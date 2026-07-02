import fs from 'node:fs';
import path from 'node:path';

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const [key, ...valueParts] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
    }
  }
}

const apiUrl = process.env.API_URL ?? 'http://localhost:4000';
const webUrl = process.env.AUTH_URL ?? 'http://localhost:3000';
const internalSecret = process.env.API_INTERNAL_SECRET ?? 'shopy-internal-secret';
const email = process.env.SMOKE_EMAIL ?? 'demo@Shopy.app';
const password = process.env.SMOKE_PASSWORD ?? 'Demo12345!';

async function request(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep text body for HTML or plain responses.
  }

  if (!response.ok) {
    throw new Error(`${init.method ?? 'GET'} ${url} failed with ${response.status}: ${text}`);
  }

  return { response, body };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sessionHeaders(user) {
  return {
    'Content-Type': 'application/json',
    'x-internal-secret': internalSecret,
    'x-user-id': user.id,
    'x-user-email': user.email,
    'x-user-name': user.name ?? '',
    'x-user-role': user.role,
    'x-organization-id': user.organizationId,
  };
}

const results = [];

const health = await request(`${apiUrl}/api/v1/health`);
assert(health.body?.status === 'ok', 'API health did not return ok');
results.push('API health');

const login = await request(`${apiUrl}/api/v1/auth/validate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
assert(login.body?.email === email, 'Auth validate did not return the demo user');
results.push('API auth validate');

const headers = sessionHeaders(login.body);

const summary = await request(`${apiUrl}/api/v1/dashboard/summary`, { headers });
assert(typeof summary.body?.totalOrders === 'number', 'Dashboard summary missing totalOrders');
results.push('Dashboard summary');

const orders = await request(`${apiUrl}/api/v1/orders?limit=5`, { headers });
assert(Array.isArray(orders.body?.data), 'Orders list missing data array');
results.push('Orders list');

const smokePhone = `+212688${Math.floor(100000 + Math.random() * 899999)}`;
const created = await request(`${apiUrl}/api/v1/orders`, {
  method: 'POST',
  headers,
  body: JSON.stringify({
    customerName: 'Smoke Test Customer',
    customerPhone: smokePhone,
    city: 'Local',
    address: 'Smoke check',
    items: [{ name: 'Smoke Test Product', quantity: 1, unitPrice: 10 }],
  }),
});
assert(created.body?.id, 'Order create did not return an id');
results.push('Orders create');

const updated = await request(`${apiUrl}/api/v1/orders/${created.body.id}/status`, {
  method: 'PATCH',
  headers,
  body: JSON.stringify({ status: 'CONFIRMED' }),
});
assert(updated.body?.status === 'CONFIRMED', 'Order status update did not persist');
results.push('Orders status update');

try {
  const csrf = await request(`${webUrl}/api/auth/csrf`);
  const cookie = csrf.response.headers.get('set-cookie')?.split(';')[0];
  const body = new URLSearchParams({
    csrfToken: csrf.body.csrfToken,
    email,
    password,
    callbackUrl: `${webUrl}/en/dashboard`,
    json: 'true',
  });

  const webLogin = await fetch(`${webUrl}/api/auth/callback/credentials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body,
    redirect: 'manual',
  });
  assert([200, 302].includes(webLogin.status), `Web auth callback returned ${webLogin.status}`);
  results.push('Auth.js credentials callback');
} catch (error) {
  throw new Error(`Auth sign-in path failed: ${error.message}`);
}

console.log(`Smoke checks passed: ${results.join(', ')}`);
