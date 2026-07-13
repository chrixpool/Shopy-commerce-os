# Shopy Production Operator Checklist

Last verified: 2026-07-13. This checklist contains no customer data or credentials.

## 1. Product costs

Workspace currency: TND. Enter non-negative values in **Factory & Costs**. A blank value is
missing; an intentional zero must be entered explicitly.

| Product                     | Shopify reference | SKU          | Selling price | Orders using product | Incomplete orders |
| --------------------------- | ----------------- | ------------ | ------------: | -------------------: | ----------------: |
| Shorty Waffle Premium Homme | `9352506867930`   | Not supplied |     TND 39.90 |                   23 |                23 |
| Short Texture Premium       | `9352518828250`   | Not supplied |     TND 39.90 |                   10 |                10 |
| Premium Essential Shorts    | `9349008130266`   | Not supplied |     TND 39.90 |                    2 |                 2 |
| Premium Essential Shorts    | `9349014814938`   | Not supplied |     TND 39.90 |                    0 |                 0 |
| Premium Essential Shorts    | `9349014454490`   | Not supplied |     TND 39.90 |                    0 |                 0 |

Required per product:

- Sewing cost
- Fabric cost
- Accessories cost
- Packaging cost
- Other variable cost
- Overhead allocation
- Target margin

Before saving, review the affected-order preview. After saving, recalculate only affected orders
and verify that Finance, Orders, Dashboard, and Factory totals agree.

## 2. Shopify live webhook

Callback URL:

`https://shopy-api-6671.onrender.com/api/v1/webhooks/shopify`

Required operator checks:

- Confirm `SHOPIFY_WEBHOOK_SECRET` is configured in Render without displaying its value.
- Register `orders/create`.
- Register `orders/updated`.
- Register `orders/cancelled`.
- Register `products/update`.
- Register `inventory_levels/update`.
- Trigger one safe real event from Shopify Admin.
- Confirm Settings and Activity show one valid event and no raw payload.

Synthetic signature and duplicate tests already pass. Production is not live-webhook verified until
one real event is observed.

## 3. Mes Colis read-only validation

Required operator inputs:

- `x-access-token`, entered only through Shopy Settings.
- At least one known historical barcode.
- Optional Mes Colis CSV export containing additional barcodes.

Validation sequence:

1. Connect and test the encrypted token.
2. Look up a known barcode.
3. Link an exact match or review uncertain matches in Mapping Review.
4. Refresh the linked parcel twice and verify no duplicate event.
5. Verify Delivery, Order Control Center, Dashboard, and Activity.
6. Verify socket health and polling fallback.

Shopy must not create, delete, or update any Mes Colis parcel or sub-account.

## 4. Release gate

Production web promotion remains blocked until:

- All six products have complete costs or documented exclusions.
- Every eligible order has a cost snapshot.
- One live Shopify webhook is observed.
- One real Mes Colis barcode is looked up and linked.
- Sync All succeeds twice with Shopify and Mes Colis connected.
- Authenticated preview browser smoke passes at desktop, 768px, and 390px.
