import { revalidatePath } from 'next/cache';
import {
  EmptyState,
  MetricCard,
  PageHeader,
  SectionHeader,
  StatusBadge,
  SurfaceCard,
} from '@/components/ui/page';
import { apiFetch, getWorkspaceSettings } from '@/lib/api';
import { formatMoney } from '@/lib/currency';

interface FactoryRecord {
  id: string;
  name: string;
  contactName?: string | null;
  phone?: string | null;
  address?: string | null;
  active: boolean;
}

interface ProductRecord {
  id: string;
  externalId?: string | null;
  name: string;
  sku?: string | null;
  price: string | number;
  stock: number;
  _count?: {
    orderItems: number;
  };
}

interface ProductCostRecord {
  id: string;
  productId: string;
  factoryId?: string | null;
  sewingCost: string | number;
  fabricCost: string | number;
  accessoryCost: string | number;
  packagingCost: string | number;
  otherVariableCost: string | number;
  overheadAllocation: string | number;
  totalUnitCost: string | number;
  currency: string;
  active: boolean;
  product: ProductRecord;
  factory?: FactoryRecord | null;
}

interface CostComponentRecord {
  id: string;
  name: string;
  category: string;
  defaultUnitCost: string | number;
  currency: string;
  active: boolean;
}

interface ExpenseRecord {
  id: string;
  name: string;
  category: string;
  amount: string | number;
  currency: string;
  recurrence: string;
  active: boolean;
}

interface CostingSummary {
  revenue: number;
  estimatedCogs: number;
  grossMargin: number;
  grossMarginPercent: number;
  expenses: number;
  snapshots: number;
  productsMissingCost: number;
}

async function createFactory(formData: FormData) {
  'use server';

  await apiFetch('/api/v1/factory', {
    method: 'POST',
    body: JSON.stringify({
      name: String(formData.get('name') ?? ''),
      contactName: String(formData.get('contactName') ?? ''),
      phone: String(formData.get('phone') ?? ''),
      address: String(formData.get('address') ?? ''),
      notes: String(formData.get('notes') ?? ''),
    }),
  });

  revalidatePath('/[locale]/factory', 'page');
}

async function createProductCost(formData: FormData) {
  'use server';

  await apiFetch('/api/v1/product-costs', {
    method: 'POST',
    body: JSON.stringify({
      productId: String(formData.get('productId') ?? ''),
      factoryId: String(formData.get('factoryId') ?? '') || undefined,
      sewingCost: Number(formData.get('sewingCost') ?? 0),
      fabricCost: Number(formData.get('fabricCost') ?? 0),
      accessoryCost: Number(formData.get('accessoryCost') ?? 0),
      packagingCost: Number(formData.get('packagingCost') ?? 0),
      otherVariableCost: Number(formData.get('otherVariableCost') ?? 0),
      overheadAllocation: Number(formData.get('overheadAllocation') ?? 0),
      currency: String(formData.get('currency') ?? 'USD'),
      notes: String(formData.get('notes') ?? ''),
    }),
  });

  revalidatePath('/[locale]/factory', 'page');
  revalidatePath('/[locale]/finance', 'page');
}

async function bulkCompleteProductCosts(formData: FormData) {
  'use server';

  const productIds = formData.getAll('productIds').map(String);
  await apiFetch('/api/v1/product-costs/bulk-complete', {
    method: 'POST',
    body: JSON.stringify({
      productIds,
      factoryId: String(formData.get('factoryId') ?? '') || undefined,
      sewingCost: Number(formData.get('sewingCost') ?? 0),
      fabricCost: Number(formData.get('fabricCost') ?? 0),
      accessoryCost: Number(formData.get('accessoryCost') ?? 0),
      packagingCost: Number(formData.get('packagingCost') ?? 0),
      otherVariableCost: Number(formData.get('otherVariableCost') ?? 0),
      overheadAllocation: Number(formData.get('overheadAllocation') ?? 0),
      currency: String(formData.get('currency') ?? 'USD'),
      notes: String(formData.get('notes') ?? ''),
    }),
  });

  revalidatePath('/[locale]/factory', 'page');
  revalidatePath('/[locale]/finance', 'page');
  revalidatePath('/[locale]/orders', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

async function createCostComponent(formData: FormData) {
  'use server';

  await apiFetch('/api/v1/cost-components', {
    method: 'POST',
    body: JSON.stringify({
      name: String(formData.get('name') ?? ''),
      category: String(formData.get('category') ?? ''),
      defaultUnitCost: Number(formData.get('defaultUnitCost') ?? 0),
      currency: String(formData.get('currency') ?? 'USD'),
    }),
  });

  revalidatePath('/[locale]/factory', 'page');
}

async function createExpense(formData: FormData) {
  'use server';

  await apiFetch('/api/v1/expenses', {
    method: 'POST',
    body: JSON.stringify({
      name: String(formData.get('name') ?? ''),
      category: String(formData.get('category') ?? ''),
      amount: Number(formData.get('amount') ?? 0),
      recurrence: String(formData.get('recurrence') ?? 'ONE_TIME'),
      currency: String(formData.get('currency') ?? 'USD'),
      notes: String(formData.get('notes') ?? ''),
    }),
  });

  revalidatePath('/[locale]/factory', 'page');
  revalidatePath('/[locale]/finance', 'page');
}

async function recalculateAll() {
  'use server';

  await apiFetch('/api/v1/costing/recalculate-all', { method: 'POST' });
  revalidatePath('/[locale]/factory', 'page');
  revalidatePath('/[locale]/finance', 'page');
  revalidatePath('/[locale]/orders', 'page');
  revalidatePath('/[locale]/dashboard', 'page');
}

function numberValue(value: string | number) {
  return typeof value === 'number' ? value : Number(value);
}

function percent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

export default async function FactoryPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const [
    workspace,
    factories,
    products,
    missingProducts,
    productCosts,
    components,
    expenses,
    summary,
  ] = await Promise.all([
    getWorkspaceSettings(),
    apiFetch<FactoryRecord[]>('/api/v1/factory'),
    apiFetch<ProductRecord[]>('/api/v1/inventory/products'),
    apiFetch<ProductRecord[]>('/api/v1/product-costs/missing?source=shopify'),
    apiFetch<ProductCostRecord[]>('/api/v1/product-costs'),
    apiFetch<CostComponentRecord[]>('/api/v1/cost-components'),
    apiFetch<ExpenseRecord[]>('/api/v1/expenses'),
    apiFetch<CostingSummary>('/api/v1/costing/summary'),
  ]);

  const activeExpenses = expenses.filter((expense) => expense.active);
  const pricedProducts = productCosts.slice(0, 6).map((cost) => {
    const unitCost = numberValue(cost.totalUnitCost);
    const retail = numberValue(cost.product.price);
    const targetMargin = 0.55;
    return {
      id: cost.id,
      product: cost.product.name,
      sku: cost.product.sku ?? 'No SKU',
      retail,
      unitCost,
      margin: retail - unitCost,
      recommendedPrice: unitCost > 0 ? unitCost / (1 - targetMargin) : 0,
      currency: cost.currency,
    };
  });

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Factory"
        title="Factory & Costs"
        description="Map suppliers, product unit costs, operating expenses, and margin snapshots without changing Shopify or store data."
        actions={
          <form action={recalculateAll}>
            <button className="button button-primary" type="submit">
              Recalculate margins
            </button>
          </form>
        }
      />

      <section className="stats-grid" aria-label="Factory costing summary">
        <MetricCard
          label="Estimated COGS"
          value={formatMoney(summary.estimatedCogs, workspace.baseCurrency, locale)}
          help="Calculated from product cost snapshots on orders."
          badge={workspace.baseCurrency}
          badgeTone="info"
        />
        <MetricCard
          label="Gross margin"
          value={formatMoney(summary.grossMargin, workspace.baseCurrency, locale)}
          help={`${percent(summary.grossMarginPercent)} margin from recalculated orders.`}
          badge={summary.grossMargin >= 0 ? 'Positive' : 'Review'}
          badgeTone={summary.grossMargin >= 0 ? 'success' : 'warning'}
        />
        <MetricCard
          label="Expenses"
          value={formatMoney(summary.expenses, workspace.baseCurrency, locale)}
          help={`${activeExpenses.length} active operating expense records.`}
          badge="Ops"
          badgeTone="muted"
        />
        <MetricCard
          label="Missing costs"
          value={String(summary.productsMissingCost)}
          help="Products without an active unit-cost record."
          badge={summary.productsMissingCost ? 'Needed' : 'Ready'}
          badgeTone={summary.productsMissingCost ? 'warning' : 'success'}
        />
        <MetricCard
          label="Completion"
          value={`${Math.max(0, Math.round(((products.length - summary.productsMissingCost) / Math.max(products.length, 1)) * 100))}%`}
          help="Products with active cost records."
          badge="Beta"
          badgeTone="info"
        />
        <MetricCard
          label="Factories"
          value={String(factories.filter((factory) => factory.active).length)}
          help="Active supplier or production partners."
          badge="Source"
          badgeTone="info"
        />
      </section>

      <SurfaceCard>
        <SectionHeader
          title="Missing-cost completion queue"
          description="Select imported products, apply one cost structure, and recalculate affected order margins immediately."
          actions={
            <StatusBadge tone={missingProducts.length ? 'warning' : 'success'}>
              {missingProducts.length} open
            </StatusBadge>
          }
        />
        {missingProducts.length ? (
          <form
            action={bulkCompleteProductCosts}
            className="form-grid compact-form"
            style={{ marginTop: 18 }}
          >
            <div className="table-wrap" style={{ gridColumn: '1 / -1' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Select</th>
                    <th>Product</th>
                    <th>Source</th>
                    <th>Retail</th>
                    <th>Affected order items</th>
                  </tr>
                </thead>
                <tbody>
                  {missingProducts.slice(0, 12).map((product) => (
                    <tr key={product.id}>
                      <td>
                        <input name="productIds" type="checkbox" value={product.id} />
                      </td>
                      <td>
                        <div className="strong-cell">{product.name}</div>
                        <div>{product.sku ?? 'No SKU'}</div>
                      </td>
                      <td>
                        <StatusBadge
                          tone={product.externalId?.startsWith('shopify') ? 'info' : 'muted'}
                        >
                          {product.externalId?.startsWith('shopify') ? 'Shopify' : 'Manual'}
                        </StatusBadge>
                      </td>
                      <td>{formatMoney(product.price, workspace.baseCurrency, locale)}</td>
                      <td>{product._count?.orderItems ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <label className="form-field">
              <span>Factory</span>
              <select className="select-field" name="factoryId">
                <option value="">No factory</option>
                {factories.map((factory) => (
                  <option key={factory.id} value={factory.id}>
                    {factory.name}
                  </option>
                ))}
              </select>
            </label>
            {[
              ['sewingCost', 'Sewing'],
              ['fabricCost', 'Fabric'],
              ['accessoryCost', 'Accessories'],
              ['packagingCost', 'Packaging'],
              ['otherVariableCost', 'Other'],
              ['overheadAllocation', 'Overhead'],
            ].map(([name, label]) => (
              <label className="form-field" key={name}>
                <span>{label}</span>
                <input className="field" name={name} type="number" min="0" step="0.01" />
              </label>
            ))}
            <label className="form-field">
              <span>Target margin</span>
              <input
                className="field"
                name="targetMargin"
                type="number"
                min="0"
                max="95"
                step="1"
                placeholder="55"
              />
              <small className="field-help">
                Use this to price-check manually after save. Shopy does not convert currencies.
              </small>
            </label>
            <input name="currency" type="hidden" value={workspace.baseCurrency} />
            <label className="form-field" style={{ gridColumn: '1 / -1' }}>
              <span>Notes</span>
              <input
                className="field"
                name="notes"
                placeholder="Applied from bulk completion queue"
              />
            </label>
            <div className="form-actions">
              <button className="button button-primary" type="submit">
                Save selected costs and recalculate
              </button>
            </div>
          </form>
        ) : (
          <EmptyState
            icon="OK"
            title="All visible products have costs"
            description="New Shopify imports without costs will appear here automatically."
          />
        )}
      </SurfaceCard>

      <section className="panel-grid">
        <form action={createFactory} className="card card-padded form-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            <h2 className="section-title">Add factory</h2>
            <p className="section-description">
              Store production partners and contact context for product costing.
            </p>
          </div>
          <label className="form-field">
            <span>Factory name</span>
            <input className="field" name="name" required />
          </label>
          <label className="form-field">
            <span>Contact</span>
            <input className="field" name="contactName" />
          </label>
          <label className="form-field">
            <span>Phone</span>
            <input className="field" name="phone" />
          </label>
          <label className="form-field">
            <span>Address</span>
            <input className="field" name="address" />
          </label>
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>Notes</span>
            <input className="field" name="notes" />
          </label>
          <div className="form-actions">
            <button className="button button-primary" type="submit">
              Add factory
            </button>
          </div>
        </form>

        <form action={createCostComponent} className="card card-padded form-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            <h2 className="section-title">Reusable component</h2>
            <p className="section-description">
              Save common cost building blocks like labels, bags, fabric, or labor.
            </p>
          </div>
          <label className="form-field">
            <span>Name</span>
            <input className="field" name="name" required />
          </label>
          <label className="form-field">
            <span>Category</span>
            <input className="field" name="category" placeholder="packaging" />
          </label>
          <label className="form-field">
            <span>Unit cost ({workspace.baseCurrency})</span>
            <input className="field" name="defaultUnitCost" type="number" min="0" step="0.01" />
          </label>
          <input name="currency" type="hidden" value={workspace.baseCurrency} />
          <div className="form-actions">
            <button className="button button-secondary" type="submit">
              Add component
            </button>
          </div>
        </form>
      </section>

      <SurfaceCard>
        <SectionHeader
          title="Product unit costs"
          description="Assign variable costs by product so orders can produce margin snapshots."
        />
        {products.length === 0 ? (
          <EmptyState
            icon="FC"
            title="Add sewing and packaging costs to calculate product margin."
            description="Create or import products first, then map their factory cost structure here."
          />
        ) : (
          <>
            <form
              action={createProductCost}
              className="form-grid compact-form"
              style={{ marginTop: 18 }}
            >
              <label className="form-field">
                <span>Product</span>
                <select className="select-field" name="productId" required>
                  <option value="">Select product</option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} {product.sku ? `(${product.sku})` : ''}
                    </option>
                  ))}
                </select>
              </label>
              <label className="form-field">
                <span>Factory</span>
                <select className="select-field" name="factoryId">
                  <option value="">No factory</option>
                  {factories.map((factory) => (
                    <option key={factory.id} value={factory.id}>
                      {factory.name}
                    </option>
                  ))}
                </select>
              </label>
              {[
                ['sewingCost', 'Sewing'],
                ['fabricCost', 'Fabric'],
                ['accessoryCost', 'Accessories'],
                ['packagingCost', 'Packaging'],
                ['otherVariableCost', 'Other variable'],
                ['overheadAllocation', 'Overhead'],
              ].map(([name, label]) => (
                <label className="form-field" key={name}>
                  <span>{label}</span>
                  <input className="field" name={name} type="number" min="0" step="0.01" />
                </label>
              ))}
              <input name="currency" type="hidden" value={workspace.baseCurrency} />
              <label className="form-field" style={{ gridColumn: '1 / -1' }}>
                <span>Notes</span>
                <input className="field" name="notes" />
              </label>
              <div className="form-actions">
                <button className="button button-primary" type="submit">
                  Save unit cost
                </button>
              </div>
            </form>

            <div className="table-wrap" style={{ marginTop: 18 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Factory</th>
                    <th>Unit cost</th>
                    <th>Retail price</th>
                    <th>Signal</th>
                  </tr>
                </thead>
                <tbody>
                  {productCosts.map((cost) => {
                    const retail = numberValue(cost.product.price);
                    const unitCost = numberValue(cost.totalUnitCost);
                    const margin = retail - unitCost;
                    return (
                      <tr key={cost.id}>
                        <td>
                          <div className="strong-cell">{cost.product.name}</div>
                          <div>{cost.product.sku ?? 'No SKU'}</div>
                        </td>
                        <td>{cost.factory?.name ?? 'Unassigned'}</td>
                        <td>{formatMoney(unitCost, cost.currency, locale)}</td>
                        <td>{formatMoney(retail, workspace.baseCurrency, locale)}</td>
                        <td>
                          <StatusBadge tone={margin >= 0 ? 'success' : 'warning'}>
                            {margin >= 0 ? 'margin ready' : 'margin risk'}
                          </StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </SurfaceCard>

      <section className="panel-grid">
        <SurfaceCard>
          <SectionHeader
            title="Price estimator"
            description="Compare current retail price against unit cost and a 55% target margin."
            actions={<StatusBadge tone="info">No FX conversion</StatusBadge>}
          />
          {pricedProducts.length ? (
            <div className="table-wrap" style={{ marginTop: 16 }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Unit cost</th>
                    <th>Current price</th>
                    <th>Recommended price</th>
                    <th>Margin signal</th>
                  </tr>
                </thead>
                <tbody>
                  {pricedProducts.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="strong-cell">{item.product}</div>
                        <div>{item.sku}</div>
                      </td>
                      <td>{formatMoney(item.unitCost, item.currency, locale)}</td>
                      <td>{formatMoney(item.retail, workspace.baseCurrency, locale)}</td>
                      <td>{formatMoney(item.recommendedPrice, item.currency, locale)}</td>
                      <td>
                        <StatusBadge tone={item.margin >= 0 ? 'success' : 'warning'}>
                          {item.margin >= 0 ? 'priced above cost' : 'below cost'}
                        </StatusBadge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon="PX"
              title="Cost products to activate price estimates"
              description="Add product costs first. Shopy will then compare retail price, unit cost, and recommended target-margin pricing."
            />
          )}
        </SurfaceCard>

        <SurfaceCard>
          <SectionHeader
            title="Fabric and document intake"
            description="Prepared for textile sheets, supplier quotes, and manufacturing files."
            actions={<StatusBadge tone="muted">Storage not enabled</StatusBadge>}
          />
          <div className="empty-state" style={{ minHeight: 180, marginTop: 16 }}>
            <div>
              <span className="empty-icon" aria-hidden="true">
                UP
              </span>
              <h2 className="empty-title">Upload planning area</h2>
              <p className="empty-description">
                File upload is intentionally disabled until a free-safe storage path is selected.
                Use notes and cost components for now; no paid storage is required.
              </p>
            </div>
          </div>
        </SurfaceCard>
      </section>

      <section className="panel-grid">
        <SurfaceCard>
          <SectionHeader
            title="Factories"
            description="Production contacts and active sourcing partners."
          />
          <div className="table-wrap" style={{ marginTop: 16 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Contact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {factories.map((factory) => (
                  <tr key={factory.id}>
                    <td className="strong-cell">{factory.name}</td>
                    <td>
                      <div>{factory.contactName ?? 'No contact'}</div>
                      <div>{factory.phone ?? factory.address ?? 'No details'}</div>
                    </td>
                    <td>
                      <StatusBadge tone={factory.active ? 'success' : 'muted'}>
                        {factory.active ? 'active' : 'disabled'}
                      </StatusBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SurfaceCard>

        <form action={createExpense} className="card card-padded form-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            <h2 className="section-title">Operating expense</h2>
            <p className="section-description">
              Track overhead that affects margin decisions without changing order revenue.
            </p>
          </div>
          <label className="form-field">
            <span>Name</span>
            <input className="field" name="name" required />
          </label>
          <label className="form-field">
            <span>Category</span>
            <input className="field" name="category" placeholder="rent, payroll, logistics" />
          </label>
          <label className="form-field">
            <span>Amount ({workspace.baseCurrency})</span>
            <input className="field" name="amount" type="number" min="0" step="0.01" />
          </label>
          <label className="form-field">
            <span>Recurrence</span>
            <select className="select-field" name="recurrence" defaultValue="MONTHLY">
              <option value="ONE_TIME">One-time</option>
              <option value="WEEKLY">Weekly</option>
              <option value="MONTHLY">Monthly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </label>
          <input name="currency" type="hidden" value={workspace.baseCurrency} />
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>Notes</span>
            <input className="field" name="notes" />
          </label>
          <div className="form-actions">
            <button className="button button-secondary" type="submit">
              Add expense
            </button>
          </div>
        </form>
      </section>

      <SurfaceCard>
        <SectionHeader
          title="Cost library"
          description="Reusable components and active expenses."
        />
        <div className="table-wrap" style={{ marginTop: 16 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Record</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
              {components.map((component) => (
                <tr key={component.id}>
                  <td className="strong-cell">{component.name}</td>
                  <td>{component.category}</td>
                  <td>
                    {formatMoney(
                      numberValue(component.defaultUnitCost),
                      component.currency,
                      locale,
                    )}
                  </td>
                  <td>
                    <StatusBadge tone={component.active ? 'info' : 'muted'}>component</StatusBadge>
                  </td>
                </tr>
              ))}
              {expenses.map((expense) => (
                <tr key={expense.id}>
                  <td className="strong-cell">{expense.name}</td>
                  <td>{expense.category}</td>
                  <td>{formatMoney(numberValue(expense.amount), expense.currency, locale)}</td>
                  <td>
                    <StatusBadge tone={expense.active ? 'warning' : 'muted'}>
                      {expense.recurrence.toLowerCase()}
                    </StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SurfaceCard>
    </div>
  );
}
