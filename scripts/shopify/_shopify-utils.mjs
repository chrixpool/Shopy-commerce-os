import fs from 'node:fs';
import path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';

const ROOT = process.cwd();

export function loadShopifyEnv() {
  for (const file of ['.env', path.join('.secrets', 'shopify.env')]) {
    const fullPath = path.join(ROOT, file);
    if (!fs.existsSync(fullPath)) continue;
    for (const line of fs.readFileSync(fullPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      if (!process.env[key]) {
        process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
      }
    }
  }
}

export function normalizeShopDomain(value = process.env.SHOPIFY_SHOP_DOMAIN ?? '') {
  const domain = value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '').toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]*\.myshopify\.com$/.test(domain)) {
    throw new Error('SHOPIFY_SHOP_DOMAIN must be a valid *.myshopify.com domain');
  }
  return domain;
}

export function connectionMethod() {
  return process.env.SHOPIFY_CONNECTION_METHOD === 'ADMIN_TOKEN'
    ? 'ADMIN_TOKEN'
    : 'CLIENT_CREDENTIALS';
}

export function requireEnv(keys) {
  const missing = keys.filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
}

export function redacted(value) {
  if (!value) return '<missing>';
  return `${String(value).slice(0, 4)}...${String(value).slice(-4)}`;
}

export async function shopifyAccessToken() {
  if (connectionMethod() === 'ADMIN_TOKEN') {
    requireEnv(['SHOPIFY_ADMIN_ACCESS_TOKEN']);
    return process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
  }

  requireEnv(['SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET']);
  const shopDomain = normalizeShopDomain();
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SHOPIFY_CLIENT_ID,
      client_secret: process.env.SHOPIFY_CLIENT_SECRET,
    }),
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep sanitized text diagnostics.
  }
  if (!response.ok) {
    throw new Error(
      `Shopify client credentials exchange failed ${response.status}: ${JSON.stringify(body).slice(0, 300)}`,
    );
  }
  if (!body?.access_token) {
    throw new Error('Shopify did not return an Admin API access token.');
  }
  return body.access_token;
}

export async function shopifyAdminFetch(pathname, init = {}) {
  const shopDomain = normalizeShopDomain();
  const accessToken = await shopifyAccessToken();
  const apiVersion = process.env.SHOPIFY_API_VERSION || '2026-01';
  const url = `https://${shopDomain}/admin/api/${apiVersion}${pathname}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
      ...init.headers,
    },
  });
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for sanitized diagnostics.
  }
  if (!response.ok) {
    throw new Error(`Shopify request failed ${response.status}: ${JSON.stringify(body).slice(0, 500)}`);
  }
  return body;
}

export function verifyHmac(rawBody, secret, hmac) {
  const digest = createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const left = Buffer.from(digest);
  const right = Buffer.from(hmac);
  return left.length === right.length && timingSafeEqual(left, right);
}
