import { IntegrationProvider } from '@prisma/client';
import type { IntegrationCapabilities } from '@shopy/shared';
import { MockAdapter } from './mock.adapter';

export class MetaAdsAdapter extends MockAdapter {
  provider = IntegrationProvider.META_ADS;
  label = 'Meta Ads';

  capabilities(): IntegrationCapabilities {
    return {
      canReadOrders: false,
      canReadProducts: false,
      canReadCustomers: false,
      canReadInventory: false,
      canReadCampaigns: true,
      canReadInsights: true,
      canReadPages: false,
      canReadPosts: false,
      canDraftPosts: false,
      canPublishPosts: false,
      canDraftAds: true,
      canLaunchAds: false,
      canReceiveWebhooks: false,
      requiresOAuth: false,
      requiresAppReview: true,
      freeByDefault: true,
    };
  }
}
