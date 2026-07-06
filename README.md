# Shopy

**Shopy — commerce operations cockpit**

Shopy is a zero-spend local/online MVP for commerce operations: auth, dashboard, orders, confirmation, fulfillment, delivery, inventory, team, and settings. It is designed to work without paid APIs, paid messaging, paid email, paid analytics, Shopify, Docker, or a custom domain.

## What Works Now

- Auth.js credentials sign-in.
- DB-backed dashboard metrics and local rule-based smart suggestions.
- Manual order creation and CSV order import.
- Automation rules with dry-run execution, run logs, and an approval queue for draft actions.
- Optional integration foundation for Shopify, Meta Ads, Facebook Pages, and Instagram.
- Read-only Shopify starter connector with test, dry-run sync, import sync, and webhook signature verification.
- Factory & Costs module for factories, product unit costs, operating expenses, and order margin snapshots.
- Confirmation queue with manual call statuses plus `tel:` and `wa.me` click links.
- Fulfillment queue with packing status and stock decrement on packed orders.
- Manual delivery parcel events/status updates.
- Inventory products, stock adjustment, and low-stock badges.
- Team members and invitation records with local invite links/tokens.
- Settings for organization identity and free/disabled integration status.

## Free-First Choices

- Email invites: local invite links only, no email API.
- SMS/WhatsApp: click links only, no paid messaging API.
- Order intake: manual creation and CSV import first.
- Delivery tracking: manual parcel events first, no courier API.
- Analytics: internal DB metrics only.
- AI: local rule-based suggestions only, no paid LLM API.
- Shopify, Meta Ads, Facebook Pages, and Instagram: optional read-only or draft-first integrations, disconnected by default.

## Automation And Integrations

Shopy now includes a safe automation foundation built around provider adapters, dry-run rules, and approval-gated draft actions.

- Shopify can be connected manually with a shop domain and Admin API token for read-only order, product, customer, and inventory sync.
- Meta Ads is read-only in this phase. Shopy can store campaign snapshots and create draft recommendations, but it will not launch ads, pause ads, or change budgets.
- Facebook Page and Instagram integrations are read-only plus draft-first. Shopy can collect channel context and prepare draft content ideas, but it will not publish posts automatically.
- Manual workflows, CSV import, and local smart suggestions remain available without external credentials.

All external write-capable paths are dry-run or approval-gated. No ad spend, publishing, messaging, email, SMS, courier, AI, or payment API is required.

### Provider Setup Notes

For local testing, add only the provider values you actually need:

- `INTEGRATION_SECRET_KEY`: required before saving encrypted provider tokens.
- `SHOPIFY_SHOP_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_WEBHOOK_SECRET`: optional Shopify read-only sync and webhook validation.
- `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`: optional Meta Ads read-only reporting.
- `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN`: optional Facebook Page read-only reporting.
- `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN`: optional Instagram read-only reporting.

Provider permissions and app review may be required by Shopify or Meta before real live data is available. The app still works without those approvals.

### Shopify Starter Setup

The current Shopify path uses an existing Shopify app/store and a manual Admin API token. It is read-only/import-first and does not write back to Shopify.

Required read-only scopes:

- `read_orders`
- `read_products`
- `read_customers`
- `read_inventory`
- `read_locations`

Local secret file:

```powershell
Copy-Item .secrets\shopify.env.example .secrets\shopify.env
```

Fill only local values in `.secrets/shopify.env`:

```env
SHOPIFY_SHOP_DOMAIN=shorty-42095.myshopify.com
SHOPIFY_ADMIN_ACCESS_TOKEN=
SHOPIFY_WEBHOOK_SECRET=
INTEGRATION_SECRET_KEY=
```

Do not commit `.secrets/shopify.env`. The Admin API access token is different from the Shopify app client secret.

Validation scripts:

```powershell
pnpm shopify:check
pnpm shopify:test
pnpm shopify:dry-run
pnpm shopify:webhook:test
```

Webhook receiver:

```text
https://<api-domain>/api/v1/webhooks/shopify
```

Useful topics for this phase:

- `orders/create`
- `orders/updated`
- `orders/cancelled`
- `products/update`
- `inventory_levels/update`

Render env names for Shopify, values not committed:

- `INTEGRATION_SECRET_KEY`
- `SHOPIFY_SHOP_DOMAIN`
- `SHOPIFY_ADMIN_ACCESS_TOKEN`
- `SHOPIFY_WEBHOOK_SECRET`
- `SHOPIFY_API_VERSION`
- `SHOPIFY_ALLOWED_SCOPES`
- `SHOPIFY_DEFAULT_SYNC_DAYS`

If the Shopify app secret has been shown in a screenshot or chat, rotate it before relying on it for production webhook verification.

### Factory And Costing

Use `/en/factory` to manage:

- factories and supplier contacts
- reusable cost components
- product unit costs
- operating expenses
- order margin recalculation

Costing uses the workspace currency and does not perform FX conversion. Missing product costs are shown as warnings instead of silently assuming zero.

## Windows 32-bit Local Notes

- Keep local scripts non-Turbo.
- Turbo is cloud/CI-only convenience, not required for local dev.
- Keep the custom CSS design system in `apps/web/src/styles/globals.css`.
- Do not reintroduce Tailwind/PostCSS as the app styling path.
- Prisma uses the binary engine.
- Docker is not required locally.

## Local Setup

Copy `.env.example` to `.env`, then keep the local defaults unless your ports differ.

Start bundled Postgres:

```powershell
pgsql\bin\pg_ctl.exe -D pgsql\data -l pgsql\data\server.log start
```

Install, generate, seed:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @shopy/api db:generate
pnpm --filter @shopy/api db:seed
```

Run locally:

```powershell
pnpm dev
```

## Demo Credentials

| Field    | Value            |
| -------- | ---------------- |
| Email    | `demo@Shopy.app` |
| Password | `Demo12345!`     |

`Shopy.app` is only a demo email identifier. Do not assume domain ownership.

## Verification URLs

- Web sign-in: http://localhost:3000/en/sign-in
- Dashboard: http://localhost:3000/en/dashboard
- Orders: http://localhost:3000/en/orders
- Confirmation: http://localhost:3000/en/confirmation
- Fulfillment: http://localhost:3000/en/fulfillment
- Delivery: http://localhost:3000/en/delivery
- Inventory: http://localhost:3000/en/inventory
- Factory & Costs: http://localhost:3000/en/factory
- Team: http://localhost:3000/en/team
- Settings: http://localhost:3000/en/settings
- API health: http://localhost:4000/api/v1/health

Run smoke checks with API and web running:

```powershell
pnpm smoke:local
```

## Free Cloud Deployment Plan

Use free tiers only:

- GitHub Free: private repository and lightweight CI.
- Neon Free: PostgreSQL.
- Render Free Web Service: API only. Render free services sleep.
- Vercel Hobby: frontend only, personal/non-commercial testing.
- Provider subdomains only: `*.onrender.com`, `*.vercel.app`.

Do not add credit-card-only services, paid add-ons, paid APIs, paid domains, or usage-based billing.

### Neon Free

Manual dashboard steps if Neon CLI is unavailable:

1. Create a free Neon account/project named `Shopy`.
2. Create database `shopy`.
3. Copy the pooled connection string as `DATABASE_URL`.
4. Copy the direct connection string as `DIRECT_URL` if available.
5. Add those values to Render environment variables.
6. Run migrations after Render env is configured:

```powershell
pnpm exec prisma migrate deploy --schema prisma/schema.prisma
```

Optional demo seed:

```powershell
pnpm --filter @shopy/api db:seed
```

### Render Free API

Service name: `Shopy-api`

Required env names, values not committed:

- `NODE_ENV`
- `PORT`
- `DATABASE_URL`
- `DIRECT_URL`
- `AUTH_SECRET`
- `API_INTERNAL_SECRET`
- `CORS_ORIGIN`

Do not use Render Postgres Free because it expires after 30 days.

### Vercel Hobby Web

Project name: `Shopy`

Required env names, values not committed:

- `NEXT_PUBLIC_API_URL`
- `API_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `NEXTAUTH_URL`
- `API_INTERNAL_SECRET`
- `NODE_ENV`

Use the Render API URL as the API base after Render deployment.

## Commands

```powershell
pnpm --filter @shopy/shared build
pnpm --filter @shopy/api db:generate
pnpm typecheck:local
pnpm build:local
pnpm lint:local
```

Cloud scripts are available as optional Turbo wrappers:

```powershell
pnpm build:cloud
pnpm typecheck:cloud
pnpm lint:cloud
```

## Safety

- Never commit `.env`, database folders, `.vercel`, `.render`, or provider tokens.
- Keep paid-provider keys blank and disabled during MVP.
- If any provider asks for payment, billing setup, or a credit card, stop and use another free path.
