import { createHmac } from 'node:crypto';
import { loadShopifyEnv, requireEnv, verifyHmac } from './_shopify-utils.mjs';

loadShopifyEnv();

try {
  requireEnv(['SHOPIFY_WEBHOOK_SECRET']);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Missing Shopify webhook secret');
  console.error('Set SHOPIFY_WEBHOOK_SECRET in .secrets/shopify.env or your host env, then retry.');
  process.exit(1);
}

const rawPayload = JSON.stringify({
  id: 1234567890,
  topic: 'orders/create',
  shop_domain: process.env.SHOPIFY_SHOP_DOMAIN || 'example.myshopify.com',
});
const hmac = createHmac('sha256', process.env.SHOPIFY_WEBHOOK_SECRET)
  .update(rawPayload, 'utf8')
  .digest('base64');

if (!verifyHmac(rawPayload, process.env.SHOPIFY_WEBHOOK_SECRET, hmac)) {
  throw new Error('Webhook HMAC verification failed');
}

console.log('Shopify webhook sample verification OK');
console.log('Secret and HMAC values were not printed.');
