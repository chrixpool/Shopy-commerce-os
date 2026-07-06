import { IntegrationProvider } from '@prisma/client';
import type { IntegrationCapabilities } from '@shopy/shared';
import type { AdapterConnection, SyncResult } from './integration-adapter.interface';
import { MockAdapter } from './mock.adapter';

export class ShopifyAdapter extends MockAdapter {
  provider = IntegrationProvider.SHOPIFY;
  label = 'Shopify';

  capabilities(): IntegrationCapabilities {
    return {
      canReadOrders: true,
      canReadProducts: true,
      canReadCustomers: true,
      canReadInventory: true,
      canReadCampaigns: false,
      canReadInsights: false,
      canReadPages: false,
      canReadPosts: false,
      canDraftPosts: false,
      canPublishPosts: false,
      canDraftAds: false,
      canLaunchAds: false,
      canReceiveWebhooks: true,
      requiresOAuth: false,
      requiresAppReview: false,
      freeByDefault: true,
    };
  }

  async testConnection(connection?: AdapterConnection | null) {
    const shopDomain = String(connection?.config?.shopDomain ?? '');
    if (!shopDomain) return { ok: false, message: 'Shop domain is required.' };
    if (!connection?.credentials?.accessToken) {
      return { ok: false, message: 'Shopify Admin API access token is required.' };
    }
    return {
      ok: true,
      message: 'Shopify connection is configured for read-only Admin API access.',
    };
  }

  async sync(connection: AdapterConnection, dryRun: boolean): Promise<SyncResult> {
    return {
      provider: this.provider,
      dryRun,
      summary: dryRun
        ? 'Shopify dry-run estimated import scope. No store data was changed.'
        : 'Shopify sync completed in safe foundation mode. No Shopify write was made.',
      counts: { orders: 0, customers: 0, products: 0, inventoryRecords: 0 },
      warnings: connection.credentials?.accessToken
        ? []
        : ['Live Shopify read import requires a valid Admin API token.'],
      records: { shopDomain: connection.config.shopDomain ?? null },
    };
  }
}
