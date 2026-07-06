import { loadShopifyEnv, normalizeShopDomain, shopifyAdminFetch } from './_shopify-utils.mjs';

loadShopifyEnv();

const shopDomain = normalizeShopDomain();
const sinceDays = Number(process.env.SHOPIFY_DEFAULT_SYNC_DAYS || 30);
const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000).toISOString();

const [products, customers, orders] = await Promise.all([
  shopifyAdminFetch('/products.json?limit=5&fields=id,title,handle,variants,created_at,updated_at'),
  shopifyAdminFetch('/customers.json?limit=5&fields=id,first_name,last_name,email,phone,default_address,created_at,updated_at'),
  shopifyAdminFetch(`/orders.json?status=any&limit=5&created_at_min=${encodeURIComponent(since)}`),
]);

console.log('Shopify dry-run sync');
console.log(`Shop: ${shopDomain}`);
console.log(`Window: last ${sinceDays} days`);
console.log(`Products sample count: ${(products.products ?? []).length}`);
console.log(`Customers sample count: ${(customers.customers ?? []).length}`);
console.log(`Orders sample count: ${(orders.orders ?? []).length}`);
console.log('No records were imported and no Shopify writes were made.');
