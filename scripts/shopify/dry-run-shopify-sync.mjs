import {
  connectionMethod,
  loadShopifyEnv,
  normalizeShopDomain,
  shopifyAdminFetchAll,
} from './_shopify-utils.mjs';

loadShopifyEnv();

const shopDomain = normalizeShopDomain();
const maxPages = Number(process.env.SHOPIFY_MAX_SYNC_PAGES || 20);

const [products, customers, orders] = await Promise.all([
  shopifyAdminFetchAll(
    '/products.json?limit=250&fields=id,title,handle,variants,created_at,updated_at',
    'products',
    maxPages,
  ),
  shopifyAdminFetchAll(
    '/customers.json?limit=250&fields=id,first_name,last_name,email,phone,default_address,created_at,updated_at',
    'customers',
    maxPages,
  ),
  shopifyAdminFetchAll('/orders.json?status=any&limit=250', 'orders', maxPages),
]);

console.log('Shopify dry-run sync');
console.log(`Connection method: ${connectionMethod()}`);
console.log(`Shop: ${shopDomain}`);
console.log(`Safety cap: ${maxPages} page(s) per resource`);
console.log(`Products available: ${products.items.length}${products.capped ? ' (capped)' : ''}`);
console.log(`Customers available: ${customers.items.length}${customers.capped ? ' (capped)' : ''}`);
console.log(`Orders available: ${orders.items.length}${orders.capped ? ' (capped)' : ''}`);
console.log('No records were imported and no Shopify writes were made.');
