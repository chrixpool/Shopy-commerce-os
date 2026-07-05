import { IntegrationProvider } from '@prisma/client';
import type { IntegrationCapabilities } from '@shopy/shared';
import { MockAdapter } from './mock.adapter';

export class FacebookPageAdapter extends MockAdapter {
  provider = IntegrationProvider.FACEBOOK_PAGE;
  label = 'Facebook Page';

  capabilities(): IntegrationCapabilities {
    return {
      canReadOrders: false,
      canReadProducts: false,
      canReadCustomers: false,
      canReadInventory: false,
      canReadCampaigns: false,
      canReadInsights: true,
      canReadPages: true,
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
