import { createHash, createHmac } from 'node:crypto';
import { loadShopifyEnv, verifyHmac } from './_shopify-utils.mjs';

loadShopifyEnv();

const secret = process.env.SHOPIFY_WEBHOOK_SECRET || 'synthetic-local-webhook-secret';

const rawPayload = JSON.stringify({
  id: 1234567890,
  topic: 'orders/create',
  shop_domain: process.env.SHOPIFY_SHOP_DOMAIN || 'example.myshopify.com',
});
const hmac = createHmac('sha256', secret)
  .update(rawPayload, 'utf8')
  .digest('base64');

if (!verifyHmac(rawPayload, secret, hmac)) {
  throw new Error('Webhook HMAC verification failed');
}

if (verifyHmac(rawPayload, secret, 'invalid-signature')) {
  throw new Error('Invalid webhook HMAC was accepted');
}

const firstHash = createHash('sha256').update(rawPayload).digest('hex');
const secondHash = createHash('sha256').update(rawPayload).digest('hex');
if (firstHash !== secondHash) {
  throw new Error('Duplicate payload hash check failed');
}

console.log('Shopify webhook sample verification OK');
console.log('Valid signature passed, invalid signature failed, duplicate hash is stable.');
console.log('Secret, HMAC, and payload values were not printed.');
