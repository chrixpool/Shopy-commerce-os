import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DraftActionStatus,
  IntegrationMode,
  IntegrationProvider,
  IntegrationStatus,
  OrderStatus,
  Prisma,
} from '@prisma/client';
import { PROVIDER_LABELS } from '@shopy/shared';
import { createHmac, createHash } from 'node:crypto';
import { PrismaService } from '../../core/prisma/prisma.service';
import { IntegrationSecretsService } from './crypto/integration-secrets.service';
import { ShopifyAdapter } from './adapters/shopify.adapter';
import { MetaAdsAdapter } from './adapters/meta-ads.adapter';
import { FacebookPageAdapter } from './adapters/facebook-page.adapter';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { CsvAdapter, ManualAdapter } from './adapters/mock.adapter';
import type { IntegrationAdapter } from './adapters/integration-adapter.interface';
import type { ConnectIntegrationDto, SyncIntegrationDto } from './dto/connect-integration.dto';
import type { CreateDraftActionDto, UpdateDraftActionStatusDto } from './dto/draft-action.dto';

const ADAPTERS: IntegrationAdapter[] = [
  new ShopifyAdapter(),
  new MetaAdsAdapter(),
  new FacebookPageAdapter(),
  new InstagramAdapter(),
  new CsvAdapter(),
  new ManualAdapter(),
];

const SHOPIFY_REQUIRED_SCOPES = [
  'read_orders',
  'read_products',
  'read_customers',
  'read_inventory',
  'read_locations',
];
const SHOPIFY_FULL_HISTORY_SCOPE = 'read_all_orders';

type ShopifyConnectionMethod = 'CLIENT_CREDENTIALS' | 'ADMIN_TOKEN';

@Injectable()
export class IntegrationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: IntegrationSecretsService,
  ) {}

  private adapter(provider: IntegrationProvider) {
    const adapter = ADAPTERS.find((item) => item.provider === provider);
    if (!adapter) throw new NotFoundException(`Provider ${provider} is not available`);
    return adapter;
  }

  private async connection(organizationId: string, provider: IntegrationProvider) {
    const integration = await this.prisma.integration.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
    });
    if (!integration) return null;
    return {
      integration,
      connection: {
        organizationId,
        config: asRecord(integration.config),
        credentials: decryptCredentials(asRecord(integration.encryptedCredentials), this.secrets),
      },
    };
  }

  async list(organizationId: string) {
    const integrations = await this.prisma.integration.findMany({ where: { organizationId } });
    return Object.values(IntegrationProvider).map((provider) => {
      const adapter = this.adapter(provider);
      const row = integrations.find((integration) => integration.provider === provider);
      return {
        provider,
        label: PROVIDER_LABELS[provider],
        status: row?.status ?? IntegrationStatus.DISCONNECTED,
        mode: row?.mode ?? IntegrationMode.READ_ONLY,
        isActive:
          row?.isActive ??
          (provider === IntegrationProvider.CSV || provider === IntegrationProvider.MANUAL),
        lastSyncAt: row?.lastSyncAt ?? null,
        errorMessage: row?.errorMessage ?? null,
        capabilities: adapter.capabilities(),
        config: sanitizeConfig(row?.config),
      };
    });
  }

  async get(organizationId: string, provider: IntegrationProvider) {
    return (await this.list(organizationId)).find((item) => item.provider === provider);
  }

  async connect(organizationId: string, provider: IntegrationProvider, dto: ConnectIntegrationDto) {
    const adapter = this.adapter(provider);
    const existing = await this.prisma.integration.findUnique({
      where: { organizationId_provider: { organizationId, provider } },
      select: { encryptedCredentials: true, config: true },
    });
    const encryptedCredentials: Record<string, unknown> = asRecord(existing?.encryptedCredentials);
    const config: Record<string, unknown> = {
      ...asRecord(existing?.config),
      ...providerConfig(provider, dto),
    };
    if (provider === IntegrationProvider.SHOPIFY) {
      const prepared = await this.prepareShopifyConnection(config, encryptedCredentials, dto);
      Object.assign(config, prepared.config);
      Object.assign(encryptedCredentials, prepared.encryptedCredentials);
    } else if (dto.accessToken) {
      encryptedCredentials.accessToken = this.secrets.encrypt(dto.accessToken);
    }

    const decryptedCredentials = decryptCredentials(encryptedCredentials, this.secrets);
    const test =
      provider === IntegrationProvider.SHOPIFY
        ? await this.testShopifyConnection({
            organizationId,
            config,
            credentials: decryptedCredentials,
          })
        : await adapter.testConnection({
            organizationId,
            config,
            credentials: decryptedCredentials,
          });
    if (provider === IntegrationProvider.SHOPIFY) {
      config.lastTestAt = new Date().toISOString();
      if ('shop' in test && test.shop) {
        config.shop = test.shop;
      }
    }

    return this.prisma.integration.upsert({
      where: { organizationId_provider: { organizationId, provider } },
      update: {
        isActive: test.ok,
        status: test.ok ? IntegrationStatus.CONNECTED : IntegrationStatus.ERROR,
        mode: normalizeMode(dto.mode),
        encryptedCredentials: encryptedCredentials as Prisma.InputJsonValue,
        credentials: {},
        config: config as Prisma.InputJsonValue,
        errorMessage: test.ok ? null : test.message,
      },
      create: {
        organizationId,
        provider,
        isActive: test.ok,
        status: test.ok ? IntegrationStatus.CONNECTED : IntegrationStatus.ERROR,
        mode: normalizeMode(dto.mode),
        encryptedCredentials: encryptedCredentials as Prisma.InputJsonValue,
        credentials: {},
        config: config as Prisma.InputJsonValue,
        errorMessage: test.ok ? null : test.message,
      },
      select: {
        provider: true,
        isActive: true,
        status: true,
        mode: true,
        config: true,
        lastSyncAt: true,
        errorMessage: true,
      },
    });
  }

  async test(organizationId: string, provider: IntegrationProvider) {
    const current = await this.connection(organizationId, provider);
    if (provider === IntegrationProvider.SHOPIFY) {
      return this.testShopifyConnection(current?.connection ?? null);
    }
    return this.adapter(provider).testConnection(current?.connection ?? null);
  }

  async sync(organizationId: string, provider: IntegrationProvider, dto: SyncIntegrationDto = {}) {
    const current = await this.connection(organizationId, provider);
    if (!current) throw new NotFoundException(`${provider} is not connected`);
    const dryRun = dto.dryRun ?? process.env.AUTOMATION_DRY_RUN_DEFAULT !== 'false';
    if (provider === IntegrationProvider.SHOPIFY) {
      return this.syncShopify(current.integration.id, current.connection, dryRun);
    }
    const result = await this.adapter(provider).sync(current.connection, dryRun);

    const run = await this.prisma.automationRun.create({
      data: {
        organizationId,
        status: 'SUCCESS',
        dryRun,
        inputSnapshot: { provider },
        outputSnapshot: result as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });

    if (!dryRun) {
      await this.prisma.integration.update({
        where: { id: current.integration.id },
        data: { lastSyncAt: new Date(), status: IntegrationStatus.CONNECTED, errorMessage: null },
      });
    }

    return { ...result, runId: run.id };
  }

  async disconnect(organizationId: string, provider: IntegrationProvider) {
    if (provider !== IntegrationProvider.SHOPIFY) {
      throw new BadRequestException('Only Shopify disconnect is supported by this endpoint.');
    }
    return this.prisma.integration.upsert({
      where: { organizationId_provider: { organizationId, provider } },
      update: {
        isActive: false,
        status: IntegrationStatus.DISCONNECTED,
        encryptedCredentials: {},
        credentials: {},
        errorMessage: null,
      },
      create: {
        organizationId,
        provider,
        isActive: false,
        status: IntegrationStatus.DISCONNECTED,
        mode: IntegrationMode.READ_ONLY,
        encryptedCredentials: {},
        credentials: {},
        config: {},
      },
      select: { provider: true, status: true, isActive: true, lastSyncAt: true },
    });
  }

  async syncRuns(organizationId: string, provider?: IntegrationProvider) {
    return this.prisma.automationRun.findMany({
      where: {
        organizationId,
        ...(provider ? { inputSnapshot: { path: ['provider'], equals: provider } } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: 25,
    });
  }

  private async prepareShopifyConnection(
    config: Record<string, unknown>,
    encryptedCredentials: Record<string, unknown>,
    dto: ConnectIntegrationDto,
  ) {
    const connectionMethod = normalizeShopifyConnectionMethod(dto.connectionMethod);
    const nextConfig: Record<string, unknown> = {
      ...config,
      connectionMethod,
      requiredScopes: SHOPIFY_REQUIRED_SCOPES,
      lastTestAt: new Date().toISOString(),
    };
    const nextEncryptedCredentials = { ...encryptedCredentials };

    if (connectionMethod === 'ADMIN_TOKEN') {
      const adminAccessToken = dto.adminAccessToken || dto.accessToken;
      if (!adminAccessToken && !nextEncryptedCredentials.accessToken) {
        throw new BadRequestException('Shopify Admin API access token is required.');
      }
      if (adminAccessToken) {
        nextEncryptedCredentials.accessToken = this.secrets.encrypt(adminAccessToken);
      }
      nextConfig.scopes = [];
      return { config: nextConfig, encryptedCredentials: nextEncryptedCredentials };
    }

    const clientId = dto.clientId || String(config.clientId ?? '');
    const clientSecret = dto.clientSecret;
    if (!clientId) {
      throw new BadRequestException('Shopify Client ID is required.');
    }
    if (!clientSecret && !nextEncryptedCredentials.clientSecret) {
      throw new BadRequestException('Shopify Client Secret is required.');
    }

    if (clientSecret) {
      nextEncryptedCredentials.clientSecret = this.secrets.encrypt(clientSecret);
    }
    nextConfig.clientId = clientId;

    const decryptedCredentials = decryptCredentials(nextEncryptedCredentials, this.secrets);
    const token = await exchangeShopifyClientCredentials(
      nextConfig,
      clientId,
      String(decryptedCredentials.clientSecret ?? ''),
    );
    nextEncryptedCredentials.accessToken = this.secrets.encrypt(token.accessToken);
    nextConfig.scopes = token.scopes;
    nextConfig.tokenExpiresAt = token.expiresIn
      ? new Date(Date.now() + token.expiresIn * 1000).toISOString()
      : null;
    nextConfig.scopeWarnings = missingShopifyScopes(token.scopes);

    return { config: nextConfig, encryptedCredentials: nextEncryptedCredentials };
  }

  private async shopifyAccessToken(
    config: Record<string, unknown>,
    credentials?: Record<string, unknown>,
  ) {
    const connectionMethod = normalizeShopifyConnectionMethod(
      String(config.connectionMethod ?? ''),
    );
    if (connectionMethod === 'ADMIN_TOKEN') {
      return String(credentials?.accessToken ?? '');
    }

    const clientId = String(config.clientId ?? '');
    const clientSecret = String(credentials?.clientSecret ?? '');
    if (!clientId || !clientSecret) return String(credentials?.accessToken ?? '');

    const tokenExpiresAt = config.tokenExpiresAt ? new Date(String(config.tokenExpiresAt)) : null;
    const shouldRefresh =
      !credentials?.accessToken ||
      !tokenExpiresAt ||
      Number.isNaN(tokenExpiresAt.getTime()) ||
      tokenExpiresAt.getTime() - Date.now() < 10 * 60 * 1000;

    if (!shouldRefresh) return String(credentials?.accessToken ?? '');

    const token = await exchangeShopifyClientCredentials(config, clientId, clientSecret);
    return token.accessToken;
  }

  private async testShopifyConnection(
    connection?: {
      organizationId: string;
      config: Record<string, unknown>;
      credentials?: Record<string, unknown>;
    } | null,
  ) {
    if (!connection) return { ok: false, message: 'Shopify is not connected.' };
    const shopDomain = normalizeShopDomain(String(connection.config.shopDomain ?? ''));
    const accessToken = await this.shopifyAccessToken(connection.config, connection.credentials);
    if (!accessToken) return { ok: false, message: 'Shopify Admin API access token is required.' };
    const shop = await shopifyFetch<{
      shop?: { name?: string; currency?: string; plan_display_name?: string };
    }>(connection.config, accessToken, '/shop.json');
    return {
      ok: true,
      message: `Connected to ${shop.shop?.name ?? shopDomain}. Currency: ${shop.shop?.currency ?? 'unknown'}.`,
      shop: shop.shop,
    };
  }

  private async syncShopify(
    integrationId: string,
    connection: {
      organizationId: string;
      config: Record<string, unknown>;
      credentials?: Record<string, unknown>;
    },
    dryRun: boolean,
  ) {
    const accessToken = await this.shopifyAccessToken(connection.config, connection.credentials);
    if (!accessToken) throw new BadRequestException('Shopify Admin API access token is required.');
    const shopDomain = normalizeShopDomain(String(connection.config.shopDomain ?? ''));
    const maxPages = Number(process.env.SHOPIFY_MAX_SYNC_PAGES || 20);

    const [products, customers, orders] = await Promise.all([
      shopifyFetchAll<ShopifyProduct, ShopifyProductsResponse>(
        connection.config,
        accessToken,
        '/products.json?limit=250&fields=id,title,handle,images,variants,created_at,updated_at',
        'products',
        maxPages,
      ),
      shopifyFetchAll<ShopifyCustomer, ShopifyCustomersResponse>(
        connection.config,
        accessToken,
        '/customers.json?limit=250&fields=id,first_name,last_name,email,phone,default_address,created_at,updated_at',
        'customers',
        maxPages,
      ),
      shopifyFetchAll<ShopifyOrder, ShopifyOrdersResponse>(
        connection.config,
        accessToken,
        '/orders.json?status=any&limit=250',
        'orders',
        maxPages,
      ),
    ]);

    const warnings = [
      ...(await this.shopifyCurrencyWarnings(connection.organizationId, orders.items)),
      ...shopifyPaginationWarnings({ products, customers, orders }, maxPages),
      ...shopifyHistoryScopeWarnings(connection.config),
    ];

    const run = await this.prisma.automationRun.create({
      data: {
        organizationId: connection.organizationId,
        status: 'SUCCESS',
        dryRun,
        inputSnapshot: {
          provider: IntegrationProvider.SHOPIFY,
          type: dryRun ? 'DRY_RUN' : 'MANUAL_SYNC',
        },
        outputSnapshot: {
          shopDomain,
          products: products.items.length,
          customers: customers.items.length,
          orders: orders.items.length,
          pages: {
            products: products.pages,
            customers: customers.pages,
            orders: orders.pages,
          },
          warnings,
        },
        finishedAt: new Date(),
      },
    });

    if (dryRun) {
      return {
        provider: IntegrationProvider.SHOPIFY,
        dryRun,
        summary:
          'Shopify dry-run completed. No records were imported and no Shopify writes were made.',
        counts: {
          products: products.items.length,
          customers: customers.items.length,
          orders: orders.items.length,
        },
        warnings,
        runId: run.id,
      };
    }

    const imported = await this.importShopifyRecords(
      connection.organizationId,
      products.items,
      customers.items,
      orders.items,
    );
    await this.prisma.integration.update({
      where: { id: integrationId },
      data: {
        isActive: true,
        status: IntegrationStatus.CONNECTED,
        lastSyncAt: new Date(),
        errorMessage: null,
        config: {
          ...connection.config,
          lastSyncTotals: imported,
          lastSyncRunId: run.id,
          shopDomain,
        } as Prisma.InputJsonValue,
      },
    });

    return {
      provider: IntegrationProvider.SHOPIFY,
      dryRun,
      summary:
        'Shopify sync imported products, customers, and orders. No Shopify writes were made.',
      counts: imported,
      warnings,
      runId: run.id,
    };
  }

  private async shopifyCurrencyWarnings(organizationId: string, orders: ShopifyOrder[]) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: { baseCurrency: true },
    });
    const workspaceCurrency = organization?.baseCurrency ?? 'USD';
    const currencies = Array.from(new Set(orders.map((order) => order.currency).filter(Boolean)));
    return currencies
      .filter((currency) => currency !== workspaceCurrency)
      .map(
        (currency) =>
          `Shopify order currency ${currency} does not match workspace currency ${workspaceCurrency}. Amounts are imported without FX conversion.`,
      );
  }

  private async importShopifyRecords(
    organizationId: string,
    products: ShopifyProduct[],
    customers: ShopifyCustomer[],
    orders: ShopifyOrder[],
  ) {
    let importedProducts = 0;
    let importedCustomers = 0;
    let importedOrders = 0;

    for (const product of products) {
      const variant = product.variants?.[0];
      await this.prisma.product.upsert({
        where: {
          organizationId_externalId: {
            organizationId,
            externalId: `shopify-product-${product.id}`,
          },
        },
        update: {
          name: product.title || 'Shopify product',
          sku: variant?.sku || undefined,
          price: decimalFromString(variant?.price, 0),
          imageUrl: product.images?.[0]?.src,
          isActive: true,
          stock: Number(variant?.inventory_quantity ?? 0),
        },
        create: {
          organizationId,
          externalId: `shopify-product-${product.id}`,
          name: product.title || 'Shopify product',
          sku: variant?.sku || undefined,
          price: decimalFromString(variant?.price, 0),
          imageUrl: product.images?.[0]?.src,
          isActive: true,
          stock: Number(variant?.inventory_quantity ?? 0),
          inventoryRecords: {
            create: {
              type: 'ADJUSTMENT',
              quantity: Number(variant?.inventory_quantity ?? 0),
              reason: 'Imported from Shopify',
              reference: String(product.id),
            },
          },
        },
      });
      importedProducts += 1;
    }

    for (const customer of customers) {
      await upsertShopifyCustomer(this.prisma, organizationId, customer);
      importedCustomers += 1;
    }

    for (const order of orders) {
      const savedCustomer = order.customer
        ? await upsertShopifyCustomer(this.prisma, organizationId, order.customer)
        : null;
      const existingOrder = await this.prisma.order.findUnique({
        where: {
          organizationId_externalId: { organizationId, externalId: `shopify-order-${order.id}` },
        },
        select: { id: true },
      });

      const lineItems = order.line_items ?? [];
      const shipping = order.shipping_address ?? order.customer?.default_address;
      const customerName =
        savedCustomer?.name ||
        [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') ||
        order.email ||
        'Shopify customer';
      const customerPhone =
        savedCustomer?.phone || order.phone || order.customer?.phone || `shopify-${order.id}`;

      const orderData = {
        orderNumber: order.name || `#${order.order_number ?? order.id}`,
        source: 'shopify',
        customerId: savedCustomer?.id,
        customerName,
        customerPhone,
        status: mapShopifyOrderStatus(order),
        totalAmount: decimalFromString(order.total_price, 0),
        shippingCost: decimalFromString(order.total_shipping_price_set?.shop_money?.amount, 0),
        shippingAddress: {
          line1: shipping?.address1 ?? '',
          line2: shipping?.address2 ?? '',
          city: shipping?.city ?? '',
          state: shipping?.province ?? '',
          zip: shipping?.zip ?? '',
          country: shipping?.country_code ?? shipping?.country ?? '',
        },
        notes: order.note ?? null,
        tags: order.tags
          ? order.tags
              .split(',')
              .map((tag) => tag.trim())
              .filter(Boolean)
          : [],
      };

      if (existingOrder) {
        await this.prisma.order.update({
          where: { id: existingOrder.id },
          data: orderData,
        });
      } else {
        await this.prisma.order.create({
          data: {
            organizationId,
            externalId: `shopify-order-${order.id}`,
            ...orderData,
            items: {
              create: lineItems.map((item) => ({
                name: item.name || item.title || 'Shopify item',
                sku: item.sku || undefined,
                quantity: Number(item.quantity ?? 1),
                unitPrice: decimalFromString(item.price, 0),
                total: decimalFromString(
                  String(Number(item.price ?? 0) * Number(item.quantity ?? 1)),
                  0,
                ),
              })),
            },
            events: {
              create: {
                type: 'imported',
                note: 'Imported from Shopify',
                data: { provider: 'SHOPIFY', externalId: String(order.id) },
              },
            },
            confirmationTask: { create: { status: 'PENDING' } },
          },
        });
      }
      importedOrders += 1;
    }

    return { products: importedProducts, customers: importedCustomers, orders: importedOrders };
  }

  async handleShopifyWebhook(
    headers: Record<string, string | undefined>,
    payload: unknown,
    rawBody?: Buffer,
  ) {
    const topic = headers['x-shopify-topic'] ?? 'unknown';
    const shopDomain = headers['x-shopify-shop-domain'];
    const organizationId =
      headers['x-shopy-organization-id'] ??
      (shopDomain ? await this.findOrganizationIdForShop(shopDomain) : null);
    if (!organizationId) {
      throw new BadRequestException('Missing organization context for Shopify webhook');
    }

    const raw = rawBody?.toString('utf8') ?? JSON.stringify(payload ?? {});
    const payloadHash = createHash('sha256').update(raw).digest('hex');
    await this.prisma.externalEvent.upsert({
      where: {
        organizationId_provider_eventType_payloadHash: {
          organizationId,
          provider: IntegrationProvider.SHOPIFY,
          eventType: topic,
          payloadHash,
        },
      },
      update: {},
      create: {
        organizationId,
        provider: IntegrationProvider.SHOPIFY,
        eventType: topic,
        externalId: shopDomain,
        payloadHash,
        status: 'RECEIVED',
      },
    });

    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    const signature = headers['x-shopify-hmac-sha256'];
    const verified = secret
      ? signature === createHmac('sha256', secret).update(raw, 'utf8').digest('base64')
      : false;

    return {
      ok: true,
      verified,
      dryRun: true,
      message: verified
        ? 'Shopify webhook recorded. Processing remains dry-run in this phase.'
        : 'Shopify webhook recorded without verified signature. Set SHOPIFY_WEBHOOK_SECRET to verify.',
    };
  }

  private async findOrganizationIdForShop(shopDomain: string) {
    const normalized = normalizeShopDomain(shopDomain);
    const integrations = await this.prisma.integration.findMany({
      where: { provider: IntegrationProvider.SHOPIFY },
      select: { organizationId: true, config: true },
    });
    return (
      integrations.find((integration) => asRecord(integration.config).shopDomain === normalized)
        ?.organizationId ?? null
    );
  }

  async marketingSummary(organizationId: string) {
    const [campaigns, draftActions] = await Promise.all([
      this.prisma.campaign.count({ where: { organizationId } }),
      this.prisma.draftAction.count({
        where: { organizationId, provider: { in: ['META_ADS', 'FACEBOOK_PAGE', 'INSTAGRAM'] } },
      }),
    ]);
    return { campaigns, draftActions, spend: 0, clicks: 0, conversions: 0 };
  }

  async campaigns(organizationId: string) {
    return this.prisma.campaign.findMany({
      where: { organizationId },
      include: { metrics: { orderBy: { date: 'desc' }, take: 7 } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  async createDraftAction(
    organizationId: string,
    userId: string,
    provider: IntegrationProvider,
    dto: CreateDraftActionDto,
  ) {
    const draft = await this.adapter(provider).createDraftAction({
      organizationId,
      actionType: dto.actionType,
      title: dto.title,
      summary: dto.summary,
      payload: (dto.payload ?? {}) as Prisma.InputJsonValue,
    });
    return this.prisma.draftAction.create({
      data: {
        organizationId,
        provider,
        actionType: dto.actionType,
        title: draft.title,
        summary: draft.summary,
        payload: draft.payload,
        status: DraftActionStatus.PENDING_APPROVAL,
        createdBy: userId,
      },
    });
  }

  async listDraftActions(organizationId: string) {
    return this.prisma.draftAction.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async updateDraftAction(
    organizationId: string,
    userId: string,
    id: string,
    dto: UpdateDraftActionStatusDto,
  ) {
    const draft = await this.prisma.draftAction.findFirst({ where: { id, organizationId } });
    if (!draft) throw new NotFoundException('Draft action not found');
    return this.prisma.draftAction.update({
      where: { id },
      data: {
        status: dto.status as DraftActionStatus,
        approvedBy: ['APPROVED', 'REJECTED'].includes(dto.status) ? userId : draft.approvedBy,
        executedAt: dto.status === 'EXECUTED' ? new Date() : draft.executedAt,
      },
    });
  }
}

function normalizeMode(value?: string) {
  if (value === 'DRAFT_ACTIONS') return IntegrationMode.DRAFT_ACTIONS;
  if (value === 'APPROVAL_REQUIRED') return IntegrationMode.APPROVAL_REQUIRED;
  return IntegrationMode.READ_ONLY;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function decryptCredentials(
  value: Record<string, unknown>,
  secrets: IntegrationSecretsService,
): Record<string, unknown> {
  return {
    ...value,
    accessToken: secrets.decrypt(value.accessToken) ?? undefined,
    clientSecret: secrets.decrypt(value.clientSecret) ?? undefined,
  };
}

function sanitizeConfig(value: unknown) {
  const config = asRecord(value);
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !key.toLowerCase().includes('token')),
  );
}

function providerConfig(provider: IntegrationProvider, dto: ConnectIntegrationDto) {
  if (provider === IntegrationProvider.SHOPIFY) {
    const connectionMethod = normalizeShopifyConnectionMethod(dto.connectionMethod);
    return Object.fromEntries(
      Object.entries({
        shopDomain: dto.shopDomain ? normalizeShopDomain(dto.shopDomain) : undefined,
        apiVersion: dto.apiVersion || process.env.SHOPIFY_API_VERSION || '2026-01',
        connectionMethod,
      }).filter(([, value]) => value !== undefined),
    );
  }
  if (provider === IntegrationProvider.META_ADS) {
    return { accountId: dto.accountId ?? null, metadata: dto.metadata ?? {} };
  }
  if (provider === IntegrationProvider.FACEBOOK_PAGE) {
    return { pageId: dto.pageId ?? null, metadata: dto.metadata ?? {} };
  }
  if (provider === IntegrationProvider.INSTAGRAM) {
    return {
      instagramBusinessAccountId: dto.instagramBusinessAccountId ?? null,
      metadata: dto.metadata ?? {},
    };
  }
  return { metadata: dto.metadata ?? {} };
}

function normalizeShopifyConnectionMethod(value?: string): ShopifyConnectionMethod {
  return value === 'ADMIN_TOKEN' ? 'ADMIN_TOKEN' : 'CLIENT_CREDENTIALS';
}

function normalizeShopDomain(input?: string) {
  if (!input) return undefined;
  const value = input
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9.-]*\.myshopify\.com$/.test(value)) {
    throw new BadRequestException('Use a valid *.myshopify.com shop domain');
  }
  return value.toLowerCase();
}

async function shopifyFetch<T>(
  config: Record<string, unknown>,
  accessToken: string,
  pathname: string,
): Promise<T> {
  const shopDomain = normalizeShopDomain(String(config.shopDomain ?? ''));
  const apiVersion = String(config.apiVersion || process.env.SHOPIFY_API_VERSION || '2026-01');
  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}${pathname}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep text for sanitized API diagnostics.
  }
  if (!response.ok) {
    throw new BadRequestException(
      `Shopify Admin API request failed with ${response.status}. Check shop domain, token, API version, and read-only scopes.`,
    );
  }
  return body as T;
}

async function shopifyFetchPage<T>(
  config: Record<string, unknown>,
  accessToken: string,
  pathname: string,
): Promise<{ body: T; nextPath?: string }> {
  const shopDomain = normalizeShopDomain(String(config.shopDomain ?? ''));
  const apiVersion = String(config.apiVersion || process.env.SHOPIFY_API_VERSION || '2026-01');
  const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}${pathname}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep text for sanitized API diagnostics.
  }
  if (!response.ok) {
    throw new BadRequestException(
      `Shopify Admin API request failed with ${response.status}. Check shop domain, token, API version, and read-only scopes.`,
    );
  }
  return {
    body: body as T,
    nextPath: shopifyNextPath(response.headers.get('link'), apiVersion),
  };
}

async function shopifyFetchAll<TItem, TResponse extends object>(
  config: Record<string, unknown>,
  accessToken: string,
  firstPath: string,
  key: string,
  maxPages: number,
) {
  const items: TItem[] = [];
  let pages = 0;
  let nextPath: string | undefined = firstPath;
  const pageLimit = Number.isFinite(maxPages) && maxPages > 0 ? maxPages : 20;

  while (nextPath && pages < pageLimit) {
    const pageResult: { body: TResponse; nextPath?: string } = await shopifyFetchPage<TResponse>(
      config,
      accessToken,
      nextPath,
    );
    const body = pageResult.body as Record<string, unknown>;
    const pageItems = Array.isArray(body[key]) ? (body[key] as TItem[]) : [];
    items.push(...pageItems);
    pages += 1;
    nextPath = pageResult.nextPath;
  }

  return { items, pages, capped: Boolean(nextPath) };
}

function shopifyNextPath(linkHeader: string | null, apiVersion: string) {
  if (!linkHeader) return undefined;
  const nextLink = linkHeader
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.includes('rel="next"'));
  const href = nextLink?.match(/<([^>]+)>/)?.[1];
  if (!href) return undefined;
  const url = new URL(href);
  const marker = `/admin/api/${apiVersion}`;
  const markerIndex = url.pathname.indexOf(marker);
  const path = markerIndex >= 0 ? url.pathname.slice(markerIndex + marker.length) : url.pathname;
  return `${path}${url.search}`;
}

function shopifyPaginationWarnings(
  resources: Record<string, { capped: boolean; pages: number; items: unknown[] }>,
  maxPages: number,
) {
  return Object.entries(resources)
    .filter(([, value]) => value.capped)
    .map(
      ([resource, value]) =>
        `Shopify ${resource} sync reached the safety cap of ${maxPages} page(s) after importing ${value.items.length} record(s). Increase SHOPIFY_MAX_SYNC_PAGES to import more.`,
    );
}

function shopifyHistoryScopeWarnings(config: Record<string, unknown>) {
  const scopes = Array.isArray(config.scopes) ? config.scopes.map(String) : [];
  if (scopes.includes(SHOPIFY_FULL_HISTORY_SCOPE)) return [];
  return [
    `For complete historical order import beyond Shopify's normal recent-order window, grant ${SHOPIFY_FULL_HISTORY_SCOPE} to the Shopify app/token if your store plan and app permissions allow it.`,
  ];
}

async function exchangeShopifyClientCredentials(
  config: Record<string, unknown>,
  clientId: string,
  clientSecret: string,
) {
  if (!clientSecret) throw new BadRequestException('Shopify Client Secret is required.');
  const shopDomain = normalizeShopDomain(String(config.shopDomain ?? ''));
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Keep raw text for sanitized diagnostics.
  }
  if (!response.ok) {
    throw new BadRequestException(shopifyTokenExchangeError(response.status, body));
  }
  const token = asRecord(body);
  const accessToken = String(token.access_token ?? '');
  if (!accessToken) {
    throw new BadRequestException('Shopify did not return an Admin API access token.');
  }
  return {
    accessToken,
    scopes: String(token.scope ?? '')
      .split(',')
      .map((scope) => scope.trim())
      .filter(Boolean),
    expiresIn: Number(token.expires_in ?? 0) || null,
  };
}

function shopifyTokenExchangeError(status: number, body: unknown) {
  const record = asRecord(body);
  const message = String(record.error_description ?? record.error ?? '');
  if (message.includes('app_not_installed')) {
    return 'Shopify app is not installed on this store. Install it before connecting.';
  }
  if (message.includes('shop_not_permitted')) {
    return 'This Shopify app is not permitted to use client credentials for this store. Use the Admin token fallback or install an app owned by the same store organization.';
  }
  if (status === 401 || message.includes('invalid_client')) {
    return 'Shopify rejected the Client ID or Client Secret. Check the credentials and try again.';
  }
  return `Shopify client credentials exchange failed with ${status}. Check store domain, app installation, credentials, and scopes.`;
}

function missingShopifyScopes(scopes: string[]) {
  return SHOPIFY_REQUIRED_SCOPES.filter((scope) => !scopes.includes(scope));
}

function decimalFromString(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapShopifyOrderStatus(order: ShopifyOrder) {
  if (order.cancelled_at) return OrderStatus.CANCELLED;
  if (order.fulfillment_status === 'fulfilled') return OrderStatus.SHIPPED;
  if (order.financial_status === 'paid' || order.confirmed) return OrderStatus.CONFIRMED;
  return OrderStatus.PENDING;
}

async function upsertShopifyCustomer(
  prisma: PrismaService,
  organizationId: string,
  customer: ShopifyCustomer,
) {
  const address = customer.default_address;
  const phone = customer.phone || address?.phone || `shopify-${customer.id}`;
  const name =
    [customer.first_name, customer.last_name].filter(Boolean).join(' ') ||
    customer.email ||
    `Shopify customer ${customer.id}`;
  return prisma.customer.upsert({
    where: { organizationId_phone: { organizationId, phone } },
    update: {
      externalId: `shopify-customer-${customer.id}`,
      name,
      email: customer.email ?? undefined,
      city: address?.city,
      address: address?.address1,
    },
    create: {
      organizationId,
      externalId: `shopify-customer-${customer.id}`,
      name,
      phone,
      email: customer.email ?? undefined,
      city: address?.city,
      address: address?.address1,
    },
  });
}

interface ShopifyProductsResponse {
  products?: ShopifyProduct[];
}

interface ShopifyCustomersResponse {
  customers?: ShopifyCustomer[];
}

interface ShopifyOrdersResponse {
  orders?: ShopifyOrder[];
}

interface ShopifyProduct {
  id: number | string;
  title?: string;
  images?: Array<{ src?: string }>;
  variants?: Array<{
    id?: number | string;
    sku?: string;
    price?: string;
    inventory_quantity?: number;
  }>;
}

interface ShopifyAddress {
  address1?: string;
  address2?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
  country_code?: string;
  phone?: string;
}

interface ShopifyCustomer {
  id: number | string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  default_address?: ShopifyAddress;
}

interface ShopifyOrder {
  id: number | string;
  name?: string;
  order_number?: number | string;
  email?: string;
  phone?: string;
  currency?: string;
  total_price?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  confirmed?: boolean;
  cancelled_at?: string | null;
  note?: string | null;
  tags?: string;
  customer?: ShopifyCustomer;
  shipping_address?: ShopifyAddress;
  total_shipping_price_set?: { shop_money?: { amount?: string } };
  line_items?: Array<{
    name?: string;
    title?: string;
    sku?: string;
    quantity?: number;
    price?: string;
  }>;
}
