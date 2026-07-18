import { revalidatePath } from 'next/cache';
import { EmptyState, MetricCard, PageHeader } from '@/components/ui/page';
import { apiFetch, getWorkspaceSettings } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

interface ProductRecord {
  id: string;
  name: string;
  sku?: string | null;
  price: string | number;
  stock: number;
  reservedStock: number;
  lowStockThreshold: number;
  inventoryRecords: Array<{
    id: string;
    type: string;
    quantity: number;
    reason?: string | null;
    createdAt: string;
  }>;
}

async function createProduct(formData: FormData) {
  'use server';

  await apiFetch('/api/v1/inventory/products', {
    method: 'POST',
    body: JSON.stringify({
      name: String(formData.get('name') ?? ''),
      sku: String(formData.get('sku') ?? '') || undefined,
      price: Number(formData.get('price') ?? 0),
      cost: Number(formData.get('cost') ?? 0),
      stock: Number(formData.get('stock') ?? 0),
      lowStockThreshold: Number(formData.get('lowStockThreshold') ?? 5),
    }),
  });

  revalidatePath('/[locale]/inventory', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

async function adjustStock(formData: FormData) {
  'use server';

  const id = String(formData.get('id') ?? '');
  const quantity = Number(formData.get('quantity') ?? 0);

  await apiFetch(`/api/v1/inventory/products/${id}/stock`, {
    method: 'PATCH',
    body: JSON.stringify({
      quantity,
      reason: String(formData.get('reason') ?? 'Manual adjustment'),
    }),
  });

  revalidatePath('/[locale]/inventory', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

export default async function InventoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [products, workspace] = await Promise.all([
    apiFetch<ProductRecord[]>('/api/v1/inventory/products'),
    getWorkspaceSettings(),
  ]);
  const lowStock = products.filter((product) => product.stock <= product.lowStockThreshold).length;
  const totalStock = products.reduce((sum, product) => sum + product.stock, 0);
  const inventoryValue = products.reduce(
    (sum, product) => sum + Number(product.price) * product.stock,
    0,
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Products"
        title="Inventory"
        description="Monitor product stock, add products, and keep an audit trail for manual adjustments."
      />

      <section className="stats-grid" aria-label="Inventory summary">
        <MetricCard
          label="Products"
          value={String(products.length)}
          help="Active products in this workspace."
          badge="DB"
          badgeTone="muted"
        />
        <MetricCard
          label="Units in stock"
          value={String(totalStock)}
          help="Current stock across all products."
          badge="Live"
          badgeTone="info"
        />
        <MetricCard
          label="Low stock"
          value={String(lowStock)}
          help="Products at or below their low-stock threshold."
          badge={lowStock ? 'Restock' : 'Clear'}
          badgeTone={lowStock ? 'warning' : 'success'}
        />
        <MetricCard
          label="Inventory value"
          value={formatMoney(inventoryValue, workspace.baseCurrency, locale)}
          help="Current stock multiplied by product prices."
          badge={workspace.baseCurrency}
          badgeTone="info"
        />
        <MetricCard
          label="Stock records"
          value={String(
            products.reduce((sum, product) => sum + product.inventoryRecords.length, 0),
          )}
          help="Recent visible inventory audit records."
          badge="Audit"
          badgeTone="muted"
        />
      </section>

      <form action={createProduct} className="card card-padded form-grid">
        <label className="form-field">
          <span>Product</span>
          <input className="field" name="name" required />
        </label>
        <label className="form-field">
          <span>SKU</span>
          <input className="field" name="sku" />
        </label>
        <label className="form-field">
          <span>Price ({workspace.baseCurrency})</span>
          <input className="field" name="price" type="number" min="0" step="0.01" required />
        </label>
        <label className="form-field">
          <span>Cost ({workspace.baseCurrency})</span>
          <input className="field" name="cost" type="number" min="0" step="0.01" />
        </label>
        <label className="form-field">
          <span>Initial stock</span>
          <input className="field" name="stock" type="number" defaultValue="0" />
        </label>
        <label className="form-field">
          <span>Low-stock threshold</span>
          <input
            className="field"
            name="lowStockThreshold"
            type="number"
            min="0"
            defaultValue="5"
          />
        </label>
        <div className="form-actions">
          <button className="button button-primary" type="submit">
            Add product
          </button>
        </div>
      </form>

      {products.length === 0 ? (
        <EmptyState
          icon="IN"
          title="No products"
          description="Connect Shopify and run a read-only sync to begin tracking products and stock."
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table data-table-mobile">
            <caption className="sr-only">Inventory products</caption>
            <thead>
              <tr>
                <th>Product</th>
                <th>Price</th>
                <th>Stock</th>
                <th>Recent records</th>
                <th>Adjust</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id}>
                  <td data-label="Product">
                    <div className="strong-cell">{product.name}</div>
                    <div>{product.sku ?? 'No SKU'}</div>
                  </td>
                  <td data-label="Price">
                    {formatMoney(product.price, workspace.baseCurrency, locale)}
                  </td>
                  <td data-label="Stock">
                    <span
                      className={`badge ${product.stock <= product.lowStockThreshold ? 'badge-warning' : 'badge-success'}`}
                    >
                      {product.stock} available
                    </span>
                    <div>{product.reservedStock} reserved</div>
                  </td>
                  <td data-label="Recent records">
                    {product.inventoryRecords.length === 0
                      ? 'Unavailable'
                      : product.inventoryRecords.map((record) => (
                          <div key={record.id}>
                            {record.type} {record.quantity}: {record.reason ?? 'No reason'}
                          </div>
                        ))}
                  </td>
                  <td data-label="Adjust">
                    <form action={adjustStock} className="inline-form">
                      <input name="id" type="hidden" value={product.id} />
                      <input
                        className="field compact-field"
                        name="quantity"
                        type="number"
                        placeholder="+/- qty"
                        required
                      />
                      <input className="field compact-field" name="reason" placeholder="Reason" />
                      <button className="button button-secondary" type="submit">
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
