import { IntegrationProvider, Prisma } from '@prisma/client';
import type { IntegrationCapabilities } from '@shopy/shared';
import { MockAdapter } from './mock.adapter';
import type { AdapterConnection, SyncResult } from './integration-adapter.interface';

const REQUIRED_PERMISSION = 'ads_read';
const DEFAULT_VERSION = 'v23.0';

export interface MetaAdAccount {
  id: string;
  name: string;
  accountStatus?: number;
  currency?: string;
  timezone?: string;
}

export interface MetaDiagnostic {
  ok: boolean;
  code:
    | 'CONNECTED'
    | 'INVALID_TOKEN'
    | 'EXPIRED_TOKEN'
    | 'MISSING_PERMISSION'
    | 'NO_AD_ACCOUNTS'
    | 'ACCOUNT_INACCESSIBLE'
    | 'RATE_LIMITED'
    | 'META_UNAVAILABLE'
    | 'NOT_CONFIGURED';
  message: string;
  permissions: string[];
  accounts: MetaAdAccount[];
  selectedAccount?: MetaAdAccount;
}

export interface MetaCampaignSnapshot {
  id: string;
  name: string;
  status: string;
  objective?: string;
  spend?: number;
  impressions?: number;
  reach?: number;
  clicks?: number;
  ctr?: number;
  cpc?: number;
  cpm?: number;
  conversions?: number;
  purchaseValue?: number;
  dateStart?: string;
  dateStop?: string;
}

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

  async testConnection(connection?: AdapterConnection | null): Promise<MetaDiagnostic> {
    const token = String(connection?.credentials?.accessToken ?? '');
    if (!connection || !token) return diagnostic('NOT_CONFIGURED');
    try {
      const [permissionRows, accounts] = await Promise.all([
        this.fetchAll<{ permission: string; status: string }>('/me/permissions', token),
        this.fetchAll<Record<string, unknown>>(
          '/me/adaccounts?fields=id,name,account_status,currency,timezone_name&limit=100',
          token,
        ),
      ]);
      const permissions = permissionRows
        .filter((item) => item.status === 'granted')
        .map((item) => item.permission);
      const normalizedAccounts = accounts.map(normalizeAccount);
      if (!permissions.includes(REQUIRED_PERMISSION)) {
        return { ...diagnostic('MISSING_PERMISSION'), permissions, accounts: normalizedAccounts };
      }
      if (!normalizedAccounts.length) {
        return { ...diagnostic('NO_AD_ACCOUNTS'), permissions, accounts: [] };
      }
      const selectedId = normalizeAccountId(String(connection.config.accountId ?? ''));
      const selectedAccount = selectedId
        ? normalizedAccounts.find((item) => item.id === selectedId)
        : normalizedAccounts.length === 1
          ? normalizedAccounts[0]
          : undefined;
      if (selectedId && !selectedAccount) {
        return {
          ...diagnostic('ACCOUNT_INACCESSIBLE'),
          permissions,
          accounts: normalizedAccounts,
        };
      }
      return {
        ...diagnostic('CONNECTED'),
        permissions,
        accounts: normalizedAccounts,
        selectedAccount,
      };
    } catch (error) {
      return { ...diagnostic(classifyMetaError(error)), permissions: [], accounts: [] };
    }
  }

  async discoverAccounts(connection: AdapterConnection) {
    return this.testConnection(connection);
  }

  async sync(connection: AdapterConnection, dryRun: boolean): Promise<SyncResult> {
    const diagnosticResult = await this.testConnection(connection);
    if (!diagnosticResult.ok || !diagnosticResult.selectedAccount) {
      return {
        provider: this.provider,
        dryRun,
        summary: diagnosticResult.message,
        counts: { found: 0, imported: 0, updated: 0, skipped: 0 },
        warnings: [diagnosticResult.message],
      };
    }
    const token = String(connection.credentials?.accessToken ?? '');
    const accountId = diagnosticResult.selectedAccount.id;
    const campaigns = await this.fetchAll<Record<string, unknown>>(
      `/${accountId}/campaigns?fields=id,name,status,objective&limit=100`,
      token,
    );
    const insights = await this.fetchAll<Record<string, unknown>>(
      `/${accountId}/insights?level=campaign&date_preset=last_30d&fields=campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,cpm,actions,action_values,date_start,date_stop&limit=100`,
      token,
    );
    const insightByCampaign = new Map(insights.map((row) => [String(row.campaign_id), row]));
    const snapshots = campaigns.map((campaign) =>
      normalizeCampaign(campaign, insightByCampaign.get(String(campaign.id))),
    );
    return {
      provider: this.provider,
      dryRun,
      summary: `${snapshots.length} campaign(s) read from Meta Ads. No ads or budgets were modified.`,
      counts: { found: snapshots.length, imported: 0, updated: 0, skipped: 0 },
      records: snapshots as unknown as Prisma.InputJsonValue,
    };
  }

  private async fetchAll<T>(path: string, token: string): Promise<T[]> {
    let next: string | undefined = this.url(path, token);
    const rows: T[] = [];
    let pages = 0;
    while (next && pages < 20) {
      const response = await fetch(next, { signal: AbortSignal.timeout(12_000) });
      const body = (await response.json().catch(() => ({}))) as {
        data?: T[];
        paging?: { next?: string };
        error?: { code?: number; error_subcode?: number; type?: string };
      };
      if (!response.ok || body.error) throw new MetaRequestError(response.status, body.error);
      rows.push(...(body.data ?? []));
      next = body.paging?.next;
      pages += 1;
    }
    return rows;
  }

  private url(path: string, token: string) {
    const version = process.env.META_API_VERSION || DEFAULT_VERSION;
    const separator = path.includes('?') ? '&' : '?';
    return `https://graph.facebook.com/${version}${path}${separator}access_token=${encodeURIComponent(token)}`;
  }
}

class MetaRequestError extends Error {
  constructor(
    readonly status: number,
    readonly meta?: { code?: number; error_subcode?: number; type?: string },
  ) {
    super('Meta API request failed');
  }
}

function diagnostic(code: MetaDiagnostic['code']): MetaDiagnostic {
  const messages: Record<MetaDiagnostic['code'], string> = {
    CONNECTED: 'The token is valid and read-only advertising data is available.',
    INVALID_TOKEN: 'The access token is invalid. Reconnect Meta Ads with a current token.',
    EXPIRED_TOKEN: 'This token has expired. Reconnect Meta Ads.',
    MISSING_PERMISSION: 'The token is valid, but it cannot read advertising data. Grant ads_read.',
    NO_AD_ACCOUNTS: 'No accessible ad accounts were found for this token.',
    ACCOUNT_INACCESSIBLE:
      'The selected ad account is no longer accessible. Choose another account.',
    RATE_LIMITED: 'Meta temporarily limited this request. Try again later.',
    META_UNAVAILABLE: 'Meta Ads is temporarily unavailable. Existing Shopy data remains available.',
    NOT_CONFIGURED: 'Meta Ads is not connected.',
  };
  return { ok: code === 'CONNECTED', code, message: messages[code], permissions: [], accounts: [] };
}

function classifyMetaError(error: unknown): MetaDiagnostic['code'] {
  if (error instanceof MetaRequestError) {
    if (error.status === 429 || [4, 17, 32, 613].includes(error.meta?.code ?? 0)) {
      return 'RATE_LIMITED';
    }
    if (error.meta?.code === 190 && [463, 467].includes(error.meta.error_subcode ?? 0)) {
      return 'EXPIRED_TOKEN';
    }
    if (error.status === 401 || error.meta?.code === 190) return 'INVALID_TOKEN';
  }
  return 'META_UNAVAILABLE';
}

function normalizeAccount(row: Record<string, unknown>): MetaAdAccount {
  return {
    id: normalizeAccountId(String(row.id ?? '')),
    name: String(row.name ?? 'Ad account'),
    accountStatus: Number(row.account_status) || undefined,
    currency: row.currency ? String(row.currency) : undefined,
    timezone: row.timezone_name ? String(row.timezone_name) : undefined,
  };
}

export function normalizeAccountId(value: string) {
  const digits = value.trim().replace(/^act_/, '');
  return digits ? `act_${digits}` : '';
}

function normalizeCampaign(
  campaign: Record<string, unknown>,
  insight?: Record<string, unknown>,
): MetaCampaignSnapshot {
  const actions = Array.isArray(insight?.actions) ? insight.actions : [];
  const values = Array.isArray(insight?.action_values) ? insight.action_values : [];
  const conversionTypes = new Set([
    'purchase',
    'omni_purchase',
    'offsite_conversion.fb_pixel_purchase',
  ]);
  const sum = (items: unknown[]) =>
    items.reduce<number>((total, item) => {
      const row = typeof item === 'object' && item ? (item as Record<string, unknown>) : {};
      return conversionTypes.has(String(row.action_type)) ? total + Number(row.value ?? 0) : total;
    }, 0);
  return {
    id: String(campaign.id),
    name: String(campaign.name ?? insight?.campaign_name ?? 'Campaign'),
    status: String(campaign.status ?? 'UNKNOWN'),
    objective: campaign.objective ? String(campaign.objective) : undefined,
    spend: numberOrUndefined(insight?.spend),
    impressions: numberOrUndefined(insight?.impressions),
    reach: numberOrUndefined(insight?.reach),
    clicks: numberOrUndefined(insight?.clicks),
    ctr: numberOrUndefined(insight?.ctr),
    cpc: numberOrUndefined(insight?.cpc),
    cpm: numberOrUndefined(insight?.cpm),
    conversions: sum(actions),
    purchaseValue: sum(values),
    dateStart: insight?.date_start ? String(insight.date_start) : undefined,
    dateStop: insight?.date_stop ? String(insight.date_stop) : undefined,
  };
}

function numberOrUndefined(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
