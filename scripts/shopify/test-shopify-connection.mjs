import {
  connectionMethod,
  loadShopifyEnv,
  normalizeShopDomain,
  shopifyAdminFetch,
} from './_shopify-utils.mjs';

loadShopifyEnv();

const shopDomain = normalizeShopDomain();
const result = await shopifyAdminFetch('/shop.json');
const shop = result.shop ?? {};

console.log('Shopify connection OK');
console.log(`Connection method: ${connectionMethod()}`);
console.log(`Shop: ${shop.name ?? '<unknown>'}`);
console.log(`Domain: ${shopDomain}`);
console.log(`Plan: ${shop.plan_display_name ?? '<unknown>'}`);
console.log(`Currency: ${shop.currency ?? '<unknown>'}`);
console.log('No Shopify writes were made.');
