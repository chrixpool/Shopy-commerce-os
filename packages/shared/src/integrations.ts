import { z } from 'zod';

export const INTEGRATION_PROVIDERS = [
  'SHOPIFY',
  'META_ADS',
  'FACEBOOK_PAGE',
  'INSTAGRAM',
  'MES_COLIS',
  'CSV',
  'MANUAL',
] as const;

export const INTEGRATION_STATUSES = [
  'DISCONNECTED',
  'CONNECTING',
  'CONNECTED',
  'ERROR',
  'DISABLED',
] as const;

export const INTEGRATION_MODES = [
  'READ_ONLY',
  'DRAFT_ACTIONS',
  'APPROVAL_REQUIRED',
  'FULL_WRITE',
] as const;

export const DRAFT_ACTION_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'EXECUTED',
  'FAILED',
] as const;

export type IntegrationProviderCode = (typeof INTEGRATION_PROVIDERS)[number];
export type IntegrationStatusCode = (typeof INTEGRATION_STATUSES)[number];
export type IntegrationModeCode = (typeof INTEGRATION_MODES)[number];
export type DraftActionStatusCode = (typeof DRAFT_ACTION_STATUSES)[number];

export const IntegrationProviderSchema = z.enum(INTEGRATION_PROVIDERS);
export const IntegrationStatusSchema = z.enum(INTEGRATION_STATUSES);
export const IntegrationModeSchema = z.enum(INTEGRATION_MODES);
export const DraftActionStatusSchema = z.enum(DRAFT_ACTION_STATUSES);

export interface IntegrationCapabilities {
  canReadOrders: boolean;
  canReadProducts: boolean;
  canReadCustomers: boolean;
  canReadInventory: boolean;
  canReadCampaigns: boolean;
  canReadInsights: boolean;
  canReadPages: boolean;
  canReadPosts: boolean;
  canDraftPosts: boolean;
  canPublishPosts: boolean;
  canDraftAds: boolean;
  canLaunchAds: boolean;
  canReceiveWebhooks: boolean;
  requiresOAuth: boolean;
  requiresAppReview: boolean;
  freeByDefault: boolean;
}

export const READ_ONLY_CAPABILITIES: IntegrationCapabilities = {
  canReadOrders: false,
  canReadProducts: false,
  canReadCustomers: false,
  canReadInventory: false,
  canReadCampaigns: false,
  canReadInsights: false,
  canReadPages: false,
  canReadPosts: false,
  canDraftPosts: false,
  canPublishPosts: false,
  canDraftAds: false,
  canLaunchAds: false,
  canReceiveWebhooks: false,
  requiresOAuth: false,
  requiresAppReview: false,
  freeByDefault: true,
};

export const PROVIDER_LABELS: Record<IntegrationProviderCode, string> = {
  SHOPIFY: 'Shopify',
  META_ADS: 'Meta Ads',
  FACEBOOK_PAGE: 'Facebook Page',
  INSTAGRAM: 'Instagram',
  MES_COLIS: 'Mes Colis',
  CSV: 'CSV import',
  MANUAL: 'Manual workflows',
};
