import { IntegrationProvider } from '@prisma/client';
import type { IntegrationCapabilities } from '@shopy/shared';
import { MockAdapter } from './mock.adapter';

export class InstagramAdapter extends MockAdapter {
  provider = IntegrationProvider.INSTAGRAM;
  label = 'Instagram';

  capabilities(): IntegrationCapabilities {
    return {
      canReadOrders: false,
      canReadProducts: false,
      canReadCustomers: false,
      canReadInventory: false,
      canReadCampaigns: false,
      canReadInsights: true,
      canReadPages: false,
      canReadPosts: true,
      canDraftPosts: true,
      canPublishPosts: false,
      canDraftAds: false,
      canLaunchAds: false,
      canReceiveWebhooks: false,
      requiresOAuth: false,
      requiresAppReview: true,
      freeByDefault: true,
    };
  }
}
