# Archived Manual Workflows

Manual order creation and CSV order intake are retained for possible future use but are disabled in
the current production product.

## Feature flag

`ENABLE_MANUAL_ORDER_WORKFLOWS=false`

The feature is enabled only when the variable is explicitly set to `true` in both the web and API
runtime. The default and production-safe behavior is disabled.

Disabled surfaces:

- New order page and Dashboard shortcut
- CSV import form and source filters
- Direct order lifecycle editing from Orders
- Manual workflow integration cards
- API order creation and CSV import endpoints

Legitimate historical manual or CSV data is preserved. This flag controls new workflow entry points;
it does not delete existing records.
