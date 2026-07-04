import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { PageHeader } from '@/components/ui/page';
import { apiFetch, getWorkspaceSettings } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

async function createOrder(formData: FormData) {
  'use server';

  const locale = String(formData.get('locale') ?? 'en');

  await apiFetch('/api/v1/orders', {
    method: 'POST',
    body: JSON.stringify({
      customerName: String(formData.get('customerName') ?? ''),
      customerPhone: String(formData.get('customerPhone') ?? ''),
      city: String(formData.get('city') ?? ''),
      address: String(formData.get('address') ?? ''),
      items: [
        {
          name: String(formData.get('productName') ?? ''),
          quantity: Number(formData.get('quantity') ?? 1),
          unitPrice: Number(formData.get('unitPrice') ?? 0),
        },
      ],
    }),
  });

  revalidatePath(`/${locale}/orders`);
  revalidatePath(`/${locale}/dashboard`);
  redirect(`/${locale}/orders`);
}

export default async function NewOrderPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const workspace = await getWorkspaceSettings();

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Manual order"
        title="New order"
        description={`Create a database-backed order with one line item. Prices are entered in ${workspace.baseCurrency}.`}
      />

      <form action={createOrder} className="card card-padded form-grid">
        <input name="locale" type="hidden" value={locale} />
        <label className="form-field">
          <span>Customer name</span>
          <input className="field" name="customerName" required />
        </label>
        <label className="form-field">
          <span>Phone</span>
          <input className="field" name="customerPhone" required />
        </label>
        <label className="form-field">
          <span>City</span>
          <input className="field" name="city" />
        </label>
        <label className="form-field">
          <span>Address</span>
          <input className="field" name="address" />
        </label>
        <label className="form-field">
          <span>Product</span>
          <input className="field" name="productName" required />
        </label>
        <label className="form-field">
          <span>Quantity</span>
          <input
            className="field"
            name="quantity"
            type="number"
            min="1"
            defaultValue="1"
            required
          />
        </label>
        <label className="form-field">
          <span>Price ({workspace.baseCurrency})</span>
          <input className="field" name="unitPrice" type="number" min="0" step="0.01" required />
          <small className="field-help">
            Example: {formatMoney(1234.56, workspace.baseCurrency, locale)}
          </small>
        </label>
        <div className="form-actions">
          <button className="button button-primary" type="submit">
            Create order
          </button>
        </div>
      </form>
    </div>
  );
}
