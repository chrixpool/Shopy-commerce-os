import {
  connectionMethod,
  loadShopifyEnv,
  normalizeShopDomain,
  redacted,
} from './_shopify-utils.mjs';

loadShopifyEnv();

const method = connectionMethod();
const requiredForLive =
  method === 'ADMIN_TOKEN'
    ? ['SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_ADMIN_ACCESS_TOKEN', 'INTEGRATION_SECRET_KEY']
    : ['SHOPIFY_SHOP_DOMAIN', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'INTEGRATION_SECRET_KEY'];

const missing = requiredForLive.filter((key) => !process.env[key]);
let shopDomain = null;
try {
  shopDomain = normalizeShopDomain();
} catch (error) {
  console.error(`Shop domain invalid: ${error.message}`);
}

console.log('Shopify env check');
console.log(`Connection method: ${method}`);
console.log(`Shop domain: ${shopDomain ?? '<invalid or missing>'}`);
console.log(`API version: ${process.env.SHOPIFY_API_VERSION || '2026-01'}`);
console.log(`Allowed scopes: ${process.env.SHOPIFY_ALLOWED_SCOPES || '<default read-only scopes>'}`);
console.log(`Client ID: ${redacted(process.env.SHOPIFY_CLIENT_ID)}`);
console.log(`Client secret: ${redacted(process.env.SHOPIFY_CLIENT_SECRET)}`);
console.log(`Admin token: ${redacted(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN)}`);
console.log(`Webhook secret: ${redacted(process.env.SHOPIFY_WEBHOOK_SECRET)}`);
console.log(`Integration key: ${redacted(process.env.INTEGRATION_SECRET_KEY)}`);

if (missing.length || !shopDomain) {
  console.error(`Not ready for live sync. Missing: ${missing.join(', ') || 'none'}`);
  process.exit(1);
}

console.log('Shopify env is ready for live read-only testing.');
