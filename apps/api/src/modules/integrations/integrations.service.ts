import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import {
  DraftActionStatus,
  ConfirmationStatus,
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
import { MesColisAdapter } from './adapters/mes-colis.adapter';
import { MesColisService } from './mes-colis.service';
import type { IntegrationAdapter } from './adapters/integration-adapter.interface';
import type { ConnectIntegrationDto, SyncIntegrationDto } from './dto/connect-integration.dto';
import type { CreateDraftActionDto, UpdateDraftActionStatusDto } from './dto/draft-action.dto';

const META_ADS_ADAPTER = new MetaAdsAdapter();
const ADAPTERS: IntegrationAdapter[] = [
  new ShopifyAdapter(),
  META_ADS_ADAPTER,
  new FacebookPageAdapter(),
  new InstagramAdapter(),
  new MesColisAdapter(),
  new CsvAdapter(),
  new ManualAdapter(),
];

const SHOPIFY_REQUIRED_SCOPES = [
  'read_orders',
  'read_products',
  'read_customers',
  'read_inventory',
];
const SHOPIFY_OPTIONAL_SCOPES = ['read_locations'];
const SHOPIFY_FULL_HISTORY_SCOPE = 'read_all_orders';

interface ShopifyResourceSyncStats {
  found: number;
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

interface ShopifySyncStats {
  products: ShopifyResourceSyncStats;
  customers: ShopifyResourceSyncStats;
  orders: ShopifyResourceSyncStats;
}

type ShopifyConnectionMethod = 'CLIENT_CREDENTIALS' | 'ADMIN_TOKEN';

@Injectable()
export class IntegrationsService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: IntegrationSecretsService,
    private readonly mesColis: MesColisService,
  ) {}

  async onModuleInit() {
    await this.recoverStaleSyncAllRuns();
  }

  private async recoverStaleSyncAllRuns() {
    const staleBefore = new Date(Date.now() - 10 * 60_000);
    await this.prisma.$transaction([
      this.prisma.automationRun.updateMany({
        where: {
          status: { in: ['QUEUED', 'RUNNING'] },
          startedAt: { lt: staleBefore },
          inputSnapshot: { path: ['type'], equals: 'SYNC_ALL' },
        },
        data: {
          status: 'FAILED',
          finishedAt: new Date(),
          errorMessage: 'Sync interrupted by a service restart. Start a new run.',
        },
      }),
      this.prisma.integrationSyncRun.updateMany({
        where: { status: { in: ['QUEUED', 'RUNNING'] }, heartbeatAt: { lt: staleBefore } },
        data: { status: 'FAILED', finishedAt: new Date(), summary: { reason: 'service_restart' } },
      }),
      this.prisma.integrationSyncProviderRun.updateMany({
        where: {
          status: { in: ['QUEUED', 'RUNNING'] },
          parentRun: { heartbeatAt: { lt: staleBefore } },
        },
        data: { status: 'FAILED', finishedAt: new Date(), errorCode: 'SERVICE_RESTART' },
      }),
    ]);
  }

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
    let credentials: Record<string, unknown> = {};
    try {
      credentials = decryptCredentials(asRecord(integration.encryptedCredentials), this.secrets);
    } catch {
      await this.prisma.integration.update({
        where: { id: integration.id },
        data: {
          status: IntegrationStatus.ERROR,
          isActive: false,
          errorMessage: 'Saved credentials cannot be decrypted. Reconnect this integration.',
        },
      });
    }
    return {
      integration,
      connection: {
        organizationId,
        config: asRecord(integration.config),
        credentials,
      },
    };
  }

  async list(organizationId: string) {
    const [integrations, recentRuns] = await Promise.all([
      this.prisma.integration.findMany({ where: { organizationId } }),
      this.prisma.automationRun.findMany({
        where: { organizationId },
        orderBy: { startedAt: 'desc' },
        take: 100,
        select: {
          status: true,
          dryRun: true,
          startedAt: true,
          finishedAt: true,
          inputSnapshot: true,
        },
      }),
    ]);
    return Object.values(IntegrationProvider).map((provider) => {
      const adapter = this.adapter(provider);
      const row = integrations.find((integration) => integration.provider === provider);
      const providerRuns = recentRuns.filter(
        (run) => asRecord(run.inputSnapshot).provider === provider && !run.dryRun,
      );
      return {
        provider,
        label: PROVIDER_LABELS[provider],
        status: row?.status ?? IntegrationStatus.DISCONNECTED,
        mode: row?.mode ?? IntegrationMode.READ_ONLY,
        isActive:
          row?.isActive ??
          (provider === IntegrationProvider.CSV || provider === IntegrationProvider.MANUAL),
        lastSyncAt: row?.lastSyncAt ?? null,
        lastSuccessfulSyncAt:
          providerRuns.find((run) => run.status === 'SUCCESS')?.finishedAt ?? null,
        lastFailedSyncAt: providerRuns.find((run) => run.status === 'FAILED')?.finishedAt ?? null,
        errorMessage: row?.errorMessage ?? null,
        capabilities: adapter.capabilities(),
        config:
          provider === IntegrationProvider.SHOPIFY
            ? sanitizeShopifyConfig(row?.config)
            : provider === IntegrationProvider.META_ADS
              ? sanitizeMetaConfig(row?.config)
              : provider === IntegrationProvider.FACEBOOK_PAGE ||
                  provider === IntegrationProvider.INSTAGRAM
                ? sanitizeSocialConfig(row?.config)
                : sanitizeConfig(row?.config),
      };
    });
  }

  async get(organizationId: string, provider: IntegrationProvider) {
    return (await this.list(organizationId)).find((item) => item.provider === provider);
  }

  async startSyncAll(organizationId: string, userId: string) {
    // Free-tier instances can stop after accepting a run. Recover stale state
    // before duplicate detection so an interrupted run cannot block the next one.
    await this.recoverStaleSyncAllRuns();
    const active = await this.prisma.automationRun.findFirst({
      where: {
        organizationId,
        status: { in: ['QUEUED', 'RUNNING'] },
        inputSnapshot: { path: ['type'], equals: 'SYNC_ALL' },
      },
      orderBy: { startedAt: 'desc' },
    });
    if (active) return this.safeSyncAllRun(active);

    const integrations = await this.prisma.integration.findMany({
      where: {
        organizationId,
        provider: {
          in: [
            IntegrationProvider.SHOPIFY,
            IntegrationProvider.META_ADS,
            IntegrationProvider.MES_COLIS,
          ],
        },
      },
      select: { provider: true, status: true, isActive: true },
    });
    const providers = [
      IntegrationProvider.SHOPIFY,
      IntegrationProvider.META_ADS,
      IntegrationProvider.MES_COLIS,
    ];
    const initial = providers.map((provider) => {
      const integration = integrations.find((item) => item.provider === provider);
      return {
        provider,
        status:
          integration?.isActive && integration.status === IntegrationStatus.CONNECTED
            ? 'queued'
            : integration?.status === IntegrationStatus.DISABLED
              ? 'skipped'
              : 'disconnected',
        startedAt: null,
        finishedAt: null,
        duration: null,
        found: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        failed: 0,
        warnings: [],
      };
    });
    const durableRun = await this.prisma.integrationSyncRun.create({
      data: {
        organizationId,
        initiatedBy: userId,
        status: 'RUNNING',
        providers: {
          create: initial.map((item) => ({
            provider: item.provider as IntegrationProvider,
            status: item.status === 'queued' ? 'QUEUED' : 'SKIPPED',
            totals: {},
            warnings: [],
          })),
        },
      },
    });
    const run = await this.prisma.automationRun.create({
      data: {
        organizationId,
        status: 'RUNNING',
        dryRun: false,
        inputSnapshot: { type: 'SYNC_ALL', initiatedBy: userId, durableRunId: durableRun.id },
        outputSnapshot: { status: 'syncing', providers: initial },
      },
    });
    setImmediate(() => void this.executeSyncAll(run.id, organizationId, initial));
    return this.safeSyncAllRun(run);
  }

  async syncAllRun(organizationId: string, runId: string) {
    const run = await this.prisma.automationRun.findFirst({
      where: { id: runId, organizationId, inputSnapshot: { path: ['type'], equals: 'SYNC_ALL' } },
    });
    if (!run) throw new NotFoundException('Sync run not found');
    return this.safeSyncAllRun(run);
  }

  async syncAllRuns(organizationId: string) {
    const runs = await this.prisma.automationRun.findMany({
      where: { organizationId, inputSnapshot: { path: ['type'], equals: 'SYNC_ALL' } },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });
    return runs.map((run) => this.safeSyncAllRun(run));
  }

  private async executeSyncAll(
    runId: string,
    organizationId: string,
    initial: Array<Record<string, unknown>>,
  ) {
    const legacyRun = await this.prisma.automationRun.findUnique({
      where: { id: runId },
      select: { inputSnapshot: true },
    });
    const durableRunId = String(asRecord(legacyRun?.inputSnapshot).durableRunId ?? '');
    const runnable = initial.filter((item) => item.status === 'queued');
    const providers = initial.map((item) =>
      item.status === 'queued' ? { ...item, status: 'syncing' } : item,
    );
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        outputSnapshot: { status: 'syncing', providers } as unknown as Prisma.InputJsonValue,
      },
    });
    for (const item of runnable) {
      const provider = item.provider as IntegrationProvider;
      const startedAt = new Date();
      if (durableRunId) {
        await this.prisma.integrationSyncProviderRun.update({
          where: { parentRunId_provider: { parentRunId: durableRunId, provider } },
          data: { status: 'RUNNING', startedAt, attempt: { increment: 1 } },
        });
      }
      let providerResult: ReturnType<typeof syncProviderResult>;
      try {
        if (provider === IntegrationProvider.MES_COLIS) {
          const result = await this.mesColis.syncLinked(organizationId);
          const totals =
            'linked' in result ? result : { linked: 0, updated: 0, unchanged: 0, failed: 1 };
          providerResult = syncProviderResult(
            provider,
            result.status === 'FAILED' ? 'failed' : 'success',
            startedAt,
            {
              found: totals.linked,
              created: 0,
              updated: totals.updated,
              skipped: totals.unchanged,
              failed: totals.failed,
            },
            totals.failed ? ['Some linked barcodes could not be refreshed.'] : [],
          );
        } else {
          const test = await this.test(organizationId, provider);
          if (!('ok' in test) || !test.ok) {
            providerResult = syncProviderResult(provider, 'failed', startedAt, null, [
              'Connection validation failed. Reconnect this provider.',
            ]);
          } else {
            const result = await this.sync(organizationId, provider, { dryRun: false });
            const safe = safeProviderCounts(result as Record<string, unknown>);
            const failed = 'ok' in result && result.ok === false;
            providerResult = syncProviderResult(
              provider,
              failed ? 'failed' : 'success',
              startedAt,
              safe,
              sanitizeWarnings(result as Record<string, unknown>),
            );
          }
        }
      } catch {
        providerResult = syncProviderResult(provider, 'failed', startedAt, null, [
          'Provider sync failed. Test or reconnect this integration.',
        ]);
      }
      const index = providers.findIndex((candidate) => candidate.provider === provider);
      providers[index] = providerResult;
      if (durableRunId) {
        await this.prisma.integrationSyncProviderRun.update({
          where: { parentRunId_provider: { parentRunId: durableRunId, provider } },
          data: {
            status: providerResult.status === 'success' ? 'SUCCESS' : 'FAILED',
            finishedAt: new Date(),
            totals: {
              found: providerResult.found,
              created: providerResult.created,
              updated: providerResult.updated,
              skipped: providerResult.skipped,
              failed: providerResult.failed,
            },
            warnings: providerResult.warnings as Prisma.InputJsonValue,
          },
        });
        await this.prisma.integrationSyncRun.update({
          where: { id: durableRunId },
          data: { heartbeatAt: new Date() },
        });
      }
      await this.prisma.automationRun.update({
        where: { id: runId },
        data: {
          outputSnapshot: { status: 'syncing', providers } as unknown as Prisma.InputJsonValue,
        },
      });
    }
    const successful = providers.filter((item) => item.status === 'success').length;
    const failed = providers.filter((item) => item.status === 'failed').length;
    const status = failed && successful ? 'partial' : failed ? 'failed' : 'success';
    await this.prisma.automationRun.update({
      where: { id: runId },
      data: {
        status: status === 'failed' ? 'FAILED' : 'SUCCESS',
        outputSnapshot: {
          status,
          providers,
          summary: `${successful} integration(s) synced, ${failed} failed, ${providers.length - successful - failed} skipped.`,
        } as unknown as Prisma.InputJsonValue,
        finishedAt: new Date(),
      },
    });
    if (durableRunId) {
      await this.prisma.integrationSyncRun.update({
        where: { id: durableRunId },
        data: {
          status: status === 'partial' ? 'PARTIAL' : status === 'failed' ? 'FAILED' : 'SUCCESS',
          finishedAt: new Date(),
          heartbeatAt: new Date(),
          summary: { successful, failed, skipped: providers.length - successful - failed },
        },
      });
    }
  }

  private safeSyncAllRun(run: {
    id: string;
    status: string;
    startedAt: Date;
    finishedAt: Date | null;
    outputSnapshot: unknown;
  }) {
    const output = asRecord(run.outputSnapshot);
    return {
      id: run.id,
      status: output.status ?? run.status.toLowerCase(),
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      duration: run.finishedAt ? run.finishedAt.getTime() - run.startedAt.getTime() : null,
      summary: typeof output.summary === 'string' ? output.summary : null,
      providers: Array.isArray(output.providers) ? output.providers : [],
    };
  }

  async verifyShopify(organizationId: string) {
    const [integration, latestRuns, localTotals, lastWebhook, lastWebhookFailure, webhookCount] =
      await Promise.all([
        this.prisma.integration.findUnique({
          where: {
            organizationId_provider: { organizationId, provider: IntegrationProvider.SHOPIFY },
          },
        }),
        this.syncRuns(organizationId, IntegrationProvider.SHOPIFY),
        Promise.all([
          this.prisma.product.count({
            where: { organizationId, externalId: { startsWith: 'shopify-product-' } },
          }),
          this.prisma.customer.count({
            where: { organizationId, externalId: { startsWith: 'shopify-customer-' } },
          }),
          this.prisma.order.count({ where: { organizationId, source: 'shopify' } }),
        ]),
        this.prisma.externalEvent.findFirst({
          where: { organizationId, provider: IntegrationProvider.SHOPIFY },
          orderBy: { receivedAt: 'desc' },
        }),
        this.prisma.externalEvent.findFirst({
          where: { organizationId, provider: IntegrationProvider.SHOPIFY, status: 'FAILED' },
          orderBy: { receivedAt: 'desc' },
        }),
        this.prisma.externalEvent.count({
          where: { organizationId, provider: IntegrationProvider.SHOPIFY },
        }),
      ]);

    const config = sanitizeShopifyConfig(integration?.config);
    const lastSuccessfulSync = latestRuns.find((run) => run.status === 'SUCCESS' && !run.dryRun);
    const lastFailedSync = latestRuns.find((run) => run.status === 'FAILED');
    const latestOutput = asRecord(lastSuccessfulSync?.outputSnapshot);
    const totals = syncOutputTotals(latestOutput);
    const local = {
      products: localTotals[0],
      customers: localTotals[1],
      orders: localTotals[2],
    };
    const mismatches = Object.entries(local)
      .filter(([key, value]) => {
        const found = totals[key]?.found;
        return typeof found === 'number' && value < found;
      })
      .map(([key, value]) => ({
        resource: key,
        local: value,
        latestSyncFound: totals[key]?.found ?? null,
      }));
    const scopeReport = shopifyScopeReport(
      Array.isArray(config.scopes) ? config.scopes.map(String) : [],
    );
    const scopeWarnings = shopifyOperatorScopeWarnings(scopeReport);
    const syncRange = asRecord(latestOutput.syncRange);
    const webhookActive = Boolean(lastWebhook);
    const states = [
      integration?.status === IntegrationStatus.CONNECTED ? 'connected' : 'not_connected',
      mismatches.length ? 'mismatch_found' : 'verified',
      syncRange.mode === 'shopify_recent_window' ? 'incomplete_historical_range' : null,
      webhookActive ? null : 'webhook_inactive',
      scopeWarnings.length ? 'scope_issue' : null,
    ].filter(Boolean);

    return {
      connectedShop: config.shopDomain ?? null,
      status: integration?.status ?? IntegrationStatus.DISCONNECTED,
      connectionMethod: config.connectionMethod ?? null,
      scopeReport,
      lastSuccessfulSync,
      lastFailedSync,
      latestSyncTotals: totals,
      localImportedTotals: local,
      mismatches,
      syncRange,
      scopeWarnings,
      webhook: {
        active: webhookActive,
        endpointPath: '/api/v1/webhooks/shopify',
        configured: Boolean(process.env.SHOPIFY_WEBHOOK_SECRET),
        count: webhookCount,
        duplicateCount: Number(config.webhookDuplicateCount ?? 0),
        signatureFailures: Number(config.webhookSignatureFailures ?? 0),
        lastReceivedAt: lastWebhook?.receivedAt ?? null,
        lastTopic: lastWebhook?.eventType ?? null,
        lastValidHmac: lastWebhook?.status !== 'FAILED',
        lastFailureReason: lastWebhookFailure?.errorMessage ?? null,
        duplicateProtection: 'enabled_by_provider_topic_payload_hash',
      },
      states,
    };
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
    if (
      provider === IntegrationProvider.FACEBOOK_PAGE ||
      provider === IntegrationProvider.INSTAGRAM
    ) {
      config.lastTestAt = new Date().toISOString();
    }
    if (provider === IntegrationProvider.SHOPIFY) {
      config.lastTestAt = new Date().toISOString();
      if ('shop' in test && test.shop) {
        config.shop = test.shop;
      }
    }
    if (provider === IntegrationProvider.META_ADS) {
      const metaTest = test as Awaited<ReturnType<MetaAdsAdapter['testConnection']>>;
      config.lastTestAt = new Date().toISOString();
      config.permissions = metaTest.permissions;
      config.accounts = metaTest.accounts.map((account) => ({
        id: maskAccountId(account.id),
        reference: account.id,
        name: account.name,
        accountStatus: account.accountStatus,
        currency: account.currency,
        timezone: account.timezone,
      }));
      if (metaTest.selectedAccount) {
        config.accountId = metaTest.selectedAccount.id;
        config.account = {
          name: metaTest.selectedAccount.name,
          reference: maskAccountId(metaTest.selectedAccount.id),
          accountStatus: metaTest.selectedAccount.accountStatus,
          currency: metaTest.selectedAccount.currency,
          timezone: metaTest.selectedAccount.timezone,
        };
      }
      config.diagnosticCode = metaTest.code;
    }

    const saved = await this.prisma.integration.upsert({
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
    return {
      ...saved,
      config:
        provider === IntegrationProvider.SHOPIFY
          ? sanitizeShopifyConfig(saved.config)
          : provider === IntegrationProvider.META_ADS
            ? sanitizeMetaConfig(saved.config)
            : provider === IntegrationProvider.FACEBOOK_PAGE ||
                provider === IntegrationProvider.INSTAGRAM
              ? sanitizeSocialConfig(saved.config)
              : sanitizeConfig(saved.config),
    };
  }

  async test(organizationId: string, provider: IntegrationProvider) {
    const current = await this.connection(organizationId, provider);
    if (provider === IntegrationProvider.SHOPIFY) {
      return this.testShopifyConnection(current?.connection ?? null);
    }
    const result = await this.adapter(provider).testConnection(current?.connection ?? null);
    if (provider === IntegrationProvider.META_ADS && current) {
      const metaResult = result as Awaited<ReturnType<MetaAdsAdapter['testConnection']>>;
      await this.prisma.integration.update({
        where: { id: current.integration.id },
        data: {
          status: metaResult.ok ? IntegrationStatus.CONNECTED : IntegrationStatus.ERROR,
          isActive: metaResult.ok,
          errorMessage: metaResult.ok ? null : metaResult.message,
          config: {
            ...asRecord(current.integration.config),
            lastTestAt: new Date().toISOString(),
            diagnosticCode: metaResult.code,
            permissions: metaResult.permissions,
          },
        },
      });
    }
    if (provider === IntegrationProvider.META_ADS) {
      const metaResult = result as Awaited<ReturnType<MetaAdsAdapter['testConnection']>>;
      return {
        ok: metaResult.ok,
        code: metaResult.code,
        message: metaResult.message,
        permissions: metaResult.permissions,
        accountCount: metaResult.accounts.length,
        selectedAccount: metaResult.selectedAccount
          ? {
              name: metaResult.selectedAccount.name,
              reference: maskAccountId(metaResult.selectedAccount.id),
            }
          : null,
      };
    }
    return result;
  }

  async metaAccounts(organizationId: string) {
    const current = await this.connection(organizationId, IntegrationProvider.META_ADS);
    if (!current) throw new NotFoundException('Meta Ads is not connected');
    const result = await META_ADS_ADAPTER.discoverAccounts(current.connection);
    return {
      ok: result.ok,
      code: result.code,
      message: result.message,
      accounts: result.accounts.map((account) => ({
        id: account.id,
        name: account.name,
        reference: maskAccountId(account.id),
        accountStatus: account.accountStatus,
        currency: account.currency,
        timezone: account.timezone,
      })),
    };
  }

  async selectMetaAccount(organizationId: string, accountId: string) {
    const current = await this.connection(organizationId, IntegrationProvider.META_ADS);
    if (!current) throw new NotFoundException('Meta Ads is not connected');
    const normalized = accountId.startsWith('act_') ? accountId : `act_${accountId}`;
    const connection = {
      ...current.connection,
      config: { ...current.connection.config, accountId: normalized },
    };
    const result = await META_ADS_ADAPTER.testConnection(connection);
    if (!result.ok || !result.selectedAccount) throw new BadRequestException(result.message);
    const nextConfig = {
      ...asRecord(current.integration.config),
      accountId: normalized,
      account: {
        name: result.selectedAccount.name,
        reference: maskAccountId(normalized),
        accountStatus: result.selectedAccount.accountStatus,
        currency: result.selectedAccount.currency,
        timezone: result.selectedAccount.timezone,
      },
      permissions: result.permissions,
      diagnosticCode: result.code,
      lastTestAt: new Date().toISOString(),
    };
    await this.prisma.integration.update({
      where: { id: current.integration.id },
      data: {
        config: nextConfig,
        status: IntegrationStatus.CONNECTED,
        isActive: true,
        errorMessage: null,
      },
    });
    return { ok: true, account: nextConfig.account };
  }

  async sync(organizationId: string, provider: IntegrationProvider, dto: SyncIntegrationDto = {}) {
    const current = await this.connection(organizationId, provider);
    if (!current) throw new NotFoundException(`${provider} is not connected`);
    const dryRun = dto.dryRun ?? process.env.AUTOMATION_DRY_RUN_DEFAULT !== 'false';
    if (provider === IntegrationProvider.SHOPIFY) {
      try {
        return await this.syncShopify(current.integration.id, current.connection, dryRun);
      } catch (error) {
        const message = integrationFailureMessage(error);
        const run = await this.prisma.automationRun.create({
          data: {
            organizationId,
            status: 'FAILED',
            dryRun,
            inputSnapshot: {
              provider: IntegrationProvider.SHOPIFY,
              type: dryRun ? 'DRY_RUN' : 'MANUAL_SYNC',
            },
            outputSnapshot: {
              products: 0,
              customers: 0,
              orders: 0,
              warnings: [message],
            },
            errorMessage: message,
            finishedAt: new Date(),
          },
        });
        await this.prisma.integration.update({
          where: { id: current.integration.id },
          data: {
            status: IntegrationStatus.ERROR,
            errorMessage: message,
          },
        });
        return {
          provider: IntegrationProvider.SHOPIFY,
          dryRun,
          ok: false,
          summary:
            'Shopify sync could not complete. Check the connection, scopes, and store permissions.',
          counts: { products: 0, customers: 0, orders: 0 },
          warnings: [message],
          runId: run.id,
        };
      }
    }
    if (provider === IntegrationProvider.META_ADS) {
      return this.syncMetaAds(current.integration.id, current.connection, dryRun);
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
    if (
      provider !== IntegrationProvider.SHOPIFY &&
      provider !== IntegrationProvider.META_ADS &&
      provider !== IntegrationProvider.FACEBOOK_PAGE &&
      provider !== IntegrationProvider.INSTAGRAM
    ) {
      throw new BadRequestException('This provider cannot be disconnected from this endpoint.');
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

  private async syncMetaAds(
    integrationId: string,
    connection: {
      organizationId: string;
      config: Record<string, unknown>;
      credentials: Record<string, unknown>;
    },
    dryRun: boolean,
  ) {
    const startedAt = new Date();
    try {
      const result = await META_ADS_ADAPTER.sync(connection, dryRun);
      const records = Array.isArray(result.records) ? result.records : [];
      let created = 0;
      let updated = 0;
      if (!dryRun) {
        for (const raw of records) {
          const row = asRecord(raw);
          const existing = await this.prisma.campaign.findUnique({
            where: {
              organizationId_externalId: {
                organizationId: connection.organizationId,
                externalId: String(row.id),
              },
            },
          });
          const campaign = await this.prisma.campaign.upsert({
            where: {
              organizationId_externalId: {
                organizationId: connection.organizationId,
                externalId: String(row.id),
              },
            },
            update: {
              name: String(row.name),
              status: String(row.status),
              objective: row.objective ? String(row.objective) : null,
            },
            create: {
              organizationId: connection.organizationId,
              externalId: String(row.id),
              name: String(row.name),
              status: String(row.status),
              objective: row.objective ? String(row.objective) : null,
            },
          });
          if (existing) updated += 1;
          else created += 1;
          if (row.dateStop) {
            await this.prisma.campaignMetric.upsert({
              where: {
                campaignId_date: { campaignId: campaign.id, date: new Date(String(row.dateStop)) },
              },
              update: metaMetricData(row),
              create: {
                campaignId: campaign.id,
                date: new Date(String(row.dateStop)),
                ...metaMetricData(row),
              },
            });
          }
        }
        await this.prisma.integration.update({
          where: { id: integrationId },
          data: { lastSyncAt: new Date(), status: IntegrationStatus.CONNECTED, errorMessage: null },
        });
      }
      const output = {
        ...result,
        counts: { ...result.counts, created, updated },
        dateRange: { preset: 'last_30d' },
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString(),
      };
      const run = await this.prisma.automationRun.create({
        data: {
          organizationId: connection.organizationId,
          status: 'SUCCESS',
          dryRun,
          inputSnapshot: { provider: IntegrationProvider.META_ADS, dateRange: 'last_30d' },
          outputSnapshot: output as unknown as Prisma.InputJsonValue,
          finishedAt: new Date(),
        },
      });
      return { ...output, runId: run.id };
    } catch {
      const message =
        'Meta Ads sync could not complete. Test the connection and review permissions.';
      await this.prisma.integration.update({
        where: { id: integrationId },
        data: { status: IntegrationStatus.ERROR, errorMessage: message },
      });
      const run = await this.prisma.automationRun.create({
        data: {
          organizationId: connection.organizationId,
          status: 'FAILED',
          dryRun,
          inputSnapshot: { provider: IntegrationProvider.META_ADS },
          outputSnapshot: { warnings: [message] },
          errorMessage: message,
          finishedAt: new Date(),
        },
      });
      return {
        provider: IntegrationProvider.META_ADS,
        ok: false,
        dryRun,
        warnings: [message],
        runId: run.id,
      };
    }
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
    nextConfig.scopeReport = shopifyScopeReport(token.scopes);
    nextConfig.scopeWarnings = shopifyScopeWarnings(token.scopes);

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
    const startedAt = new Date();
    const accessToken = await this.shopifyAccessToken(connection.config, connection.credentials);
    if (!accessToken) throw new BadRequestException('Shopify Admin API access token is required.');
    const shopDomain = normalizeShopDomain(String(connection.config.shopDomain ?? ''));
    if (!shopDomain) throw new BadRequestException('Shopify shop domain is required.');
    const maxPages = Number(process.env.SHOPIFY_MAX_SYNC_PAGES || 20);
    const scopeReport = shopifyScopeReport(
      Array.isArray(connection.config.scopes) ? connection.config.scopes.map(String) : [],
    );

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
      ...shopifyHistoryScopeWarnings(scopeReport),
    ];
    const syncRange = {
      mode: scopeReport.historicalOrders.satisfied
        ? 'all_available_orders'
        : 'shopify_recent_window',
      maxPages,
    };

    if (dryRun) {
      const stats = shopifyDryRunStats({
        products: products.items.length,
        customers: customers.items.length,
        orders: orders.items.length,
      });
      const run = await this.prisma.automationRun.create({
        data: {
          organizationId: connection.organizationId,
          status: 'SUCCESS',
          dryRun,
          startedAt,
          inputSnapshot: {
            provider: IntegrationProvider.SHOPIFY,
            type: 'DRY_RUN',
          },
          outputSnapshot: shopifySyncOutput({
            shopDomain,
            stats,
            pages: {
              products: products.pages,
              customers: customers.pages,
              orders: orders.pages,
            },
            warnings,
            syncRange,
            startedAt,
            finishedAt: new Date(),
          }) as unknown as Prisma.InputJsonObject,
          finishedAt: new Date(),
        },
      });
      return {
        provider: IntegrationProvider.SHOPIFY,
        dryRun,
        summary:
          'Shopify dry-run completed. No records were imported and no Shopify writes were made.',
        counts: stats,
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
    const finishedAt = new Date();
    const run = await this.prisma.automationRun.create({
      data: {
        organizationId: connection.organizationId,
        status: shopifyRunStatus(imported, warnings),
        dryRun,
        startedAt,
        inputSnapshot: {
          provider: IntegrationProvider.SHOPIFY,
          type: 'MANUAL_SYNC',
        },
        outputSnapshot: shopifySyncOutput({
          shopDomain,
          stats: imported,
          pages: {
            products: products.pages,
            customers: customers.pages,
            orders: orders.pages,
          },
          warnings,
          syncRange,
          startedAt,
          finishedAt,
        }) as unknown as Prisma.InputJsonObject,
        finishedAt,
      },
    });
    await this.prisma.integration.update({
      where: { id: integrationId },
      data: {
        isActive: true,
        status: IntegrationStatus.CONNECTED,
        lastSyncAt: finishedAt,
        errorMessage: null,
        config: {
          ...connection.config,
          lastSyncTotals: imported,
          lastSyncRunId: run.id,
          shopDomain,
          scopeReport,
          scopeWarnings: shopifyScopeWarnings(
            Array.isArray(connection.config.scopes) ? connection.config.scopes.map(String) : [],
          ),
        } as unknown as Prisma.InputJsonObject,
      },
    });

    return {
      provider: IntegrationProvider.SHOPIFY,
      dryRun,
      summary: 'Shopify sync completed. No Shopify writes were made.',
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
    const stats: ShopifySyncStats = {
      products: resourceStats(products.length),
      customers: resourceStats(customers.length),
      orders: resourceStats(orders.length),
    };

    for (const product of products) {
      const variant = product.variants?.[0];
      const externalId = `shopify-product-${product.id}`;
      const existing = await this.prisma.product.findUnique({
        where: { organizationId_externalId: { organizationId, externalId } },
        select: { id: true },
      });
      await this.prisma.product.upsert({
        where: {
          organizationId_externalId: {
            organizationId,
            externalId,
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
      if (existing) stats.products.updated += 1;
      else stats.products.created += 1;
    }

    for (const customer of customers) {
      const existed = await shopifyCustomerExists(this.prisma, organizationId, customer);
      await upsertShopifyCustomer(this.prisma, organizationId, customer);
      if (existed) stats.customers.updated += 1;
      else stats.customers.created += 1;
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
        providerStatus: shopifyProviderStatus(order),
        financialStatus: order.financial_status ?? null,
        fulfillmentStatus: order.fulfillment_status ?? null,
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
      const itemCreates = await Promise.all(
        lineItems.map(async (item) => {
          const product = await findShopifyProductForLineItem(this.prisma, organizationId, item);
          return {
            productId: product?.id,
            name: item.name || item.title || 'Shopify item',
            sku: item.sku || product?.sku || undefined,
            quantity: Number(item.quantity ?? 1),
            unitPrice: decimalFromString(item.price, 0),
            total: decimalFromString(
              String(Number(item.price ?? 0) * Number(item.quantity ?? 1)),
              0,
            ),
          };
        }),
      );

      if (existingOrder) {
        await this.prisma.order.update({
          where: { id: existingOrder.id },
          data: {
            ...orderData,
            items: {
              deleteMany: {},
              create: itemCreates,
            },
          },
        });
        stats.orders.updated += 1;
      } else {
        await this.prisma.order.create({
          data: {
            organizationId,
            externalId: `shopify-order-${order.id}`,
            ...orderData,
            status: OrderStatus.PENDING,
            items: {
              create: itemCreates,
            },
            events: {
              create: {
                type: 'imported',
                note: 'Imported from Shopify',
                data: { provider: 'SHOPIFY', externalId: String(order.id) },
              },
            },
            confirmationTask: { create: { status: ConfirmationStatus.PENDING } },
          },
        });
        stats.orders.created += 1;
      }
    }

    return stats;
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
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    const signature = headers['x-shopify-hmac-sha256'];
    const verified = secret
      ? signature === createHmac('sha256', secret).update(raw, 'utf8').digest('base64')
      : false;
    const payloadHash = createHash('sha256').update(raw).digest('hex');
    const existing = await this.prisma.externalEvent.findUnique({
      where: {
        organizationId_provider_eventType_payloadHash: {
          organizationId,
          provider: IntegrationProvider.SHOPIFY,
          eventType: topic,
          payloadHash,
        },
      },
    });

    if (existing) {
      await this.recordShopifyWebhookDiagnostic(organizationId, {
        duplicate: true,
        topic,
        valid: verified,
      });
      return {
        ok: true,
        verified,
        duplicate: true,
        dryRun: true,
        message: 'Duplicate Shopify webhook ignored.',
      };
    }

    await this.prisma.externalEvent.create({
      data: {
        organizationId,
        provider: IntegrationProvider.SHOPIFY,
        eventType: topic,
        externalId: shopDomain,
        payloadHash,
        status: verified ? 'RECEIVED' : 'FAILED',
        errorMessage: verified
          ? null
          : secret
            ? 'Invalid Shopify webhook signature.'
            : 'Webhook secret is not configured.',
      },
    });

    await this.recordShopifyWebhookDiagnostic(organizationId, {
      duplicate: false,
      topic,
      valid: verified,
    });

    if (!verified) {
      throw new BadRequestException(
        secret ? 'Invalid Shopify webhook signature.' : 'Shopify webhook secret is not configured.',
      );
    }

    return {
      ok: true,
      verified,
      duplicate: false,
      dryRun: true,
      message: 'Shopify webhook verified and recorded. Processing remains dry-run in this phase.',
    };
  }

  private async recordShopifyWebhookDiagnostic(
    organizationId: string,
    result: { duplicate: boolean; topic: string; valid: boolean },
  ) {
    const integration = await this.prisma.integration.findUnique({
      where: { organizationId_provider: { organizationId, provider: IntegrationProvider.SHOPIFY } },
      select: { config: true },
    });
    if (!integration) return;
    const config = asRecord(integration.config);
    await this.prisma.integration.update({
      where: { organizationId_provider: { organizationId, provider: IntegrationProvider.SHOPIFY } },
      data: {
        config: {
          ...config,
          webhookDuplicateCount:
            Number(config.webhookDuplicateCount ?? 0) + (result.duplicate ? 1 : 0),
          webhookSignatureFailures:
            Number(config.webhookSignatureFailures ?? 0) + (!result.valid ? 1 : 0),
          ...(result.valid
            ? { lastValidWebhookAt: new Date().toISOString(), lastWebhookTopic: result.topic }
            : { lastWebhookFailureAt: new Date().toISOString() }),
        } as Prisma.InputJsonValue,
      },
    });
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
    const [campaigns, draftActions, metrics] = await Promise.all([
      this.prisma.campaign.count({ where: { organizationId } }),
      this.prisma.draftAction.count({
        where: { organizationId, provider: { in: ['META_ADS', 'FACEBOOK_PAGE', 'INSTAGRAM'] } },
      }),
      this.prisma.campaignMetric.findMany({
        where: { campaign: { organizationId } },
        orderBy: { date: 'desc' },
      }),
    ]);
    const totals = metrics.reduce(
      (sum, metric) => ({
        spend: sum.spend + Number(metric.spend),
        impressions: sum.impressions + metric.impressions,
        clicks: sum.clicks + metric.clicks,
        conversions: sum.conversions + metric.conversions,
        reportedValue: sum.reportedValue + Number(metric.revenue),
      }),
      { spend: 0, impressions: 0, clicks: 0, conversions: 0, reportedValue: 0 },
    );
    return {
      campaigns,
      draftActions,
      ...totals,
      ctr: totals.impressions ? (totals.clicks / totals.impressions) * 100 : null,
      cpc: totals.clicks ? totals.spend / totals.clicks : null,
      cpm: totals.impressions ? (totals.spend / totals.impressions) * 1000 : null,
      roas:
        totals.reportedValue > 0 && totals.spend > 0 ? totals.reportedValue / totals.spend : null,
      metricSource: 'Meta Ads',
      dateRange: 'Latest synced 30-day snapshots',
    };
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

export function sanitizeShopifyConfig(value: unknown): Record<string, unknown> {
  const config = sanitizeConfig(value);
  const scopes = Array.isArray(config.scopes) ? config.scopes.map(String) : [];
  const scopeReport = shopifyScopeReport(scopes);
  const shop = asRecord(config.shop);
  return {
    shop: Object.keys(shop).length
      ? {
          name: shop.name ?? null,
          domain: shop.domain ?? shop.myshopify_domain ?? config.shopDomain ?? null,
          currency: shop.currency ?? null,
        }
      : null,
    shopDomain: config.shopDomain ?? null,
    apiVersion: config.apiVersion ?? null,
    connectionMethod: config.connectionMethod ?? null,
    scopes,
    requiredScopes: Array.isArray(config.requiredScopes) ? config.requiredScopes.map(String) : [],
    lastTestAt: config.lastTestAt ?? null,
    lastSyncRunId: config.lastSyncRunId ?? null,
    lastSyncTotals: config.lastSyncTotals ?? null,
    webhookDuplicateCount: Number(config.webhookDuplicateCount ?? 0),
    webhookSignatureFailures: Number(config.webhookSignatureFailures ?? 0),
    lastValidWebhookAt: config.lastValidWebhookAt ?? null,
    lastWebhookTopic: config.lastWebhookTopic ?? null,
    scopeReport,
    scopeWarnings: shopifyOperatorScopeWarnings(scopeReport),
  };
}

function sanitizeMetaConfig(value: unknown): Record<string, unknown> {
  const config = sanitizeConfig(value);
  const account = asRecord(config.account);
  return {
    connectionName: config.connectionName ?? 'Meta Ads',
    diagnosticCode: config.diagnosticCode ?? null,
    permissions: Array.isArray(config.permissions) ? config.permissions.map(String) : [],
    account: Object.keys(account).length ? account : null,
    lastTestAt: config.lastTestAt ?? null,
    tokenExpiresAt: config.tokenExpiresAt ?? null,
  };
}

function sanitizeSocialConfig(value: unknown): Record<string, unknown> {
  const config = sanitizeConfig(value);
  const externalReference = String(config.pageId ?? config.instagramBusinessAccountId ?? '');
  return {
    metadata: config.metadata ?? {},
    maskedReference: externalReference ? `****${externalReference.slice(-4)}` : null,
    lastTestAt: config.lastTestAt ?? null,
    tokenExpiresAt: config.tokenExpiresAt ?? null,
  };
}

function maskAccountId(value: string) {
  const suffix = value.replace(/^act_/, '').slice(-4);
  return suffix ? `act_••••${suffix}` : 'Unavailable';
}

function metaMetricData(row: Record<string, unknown>) {
  const spend = Number(row.spend ?? 0);
  const impressions = Math.max(0, Math.round(Number(row.impressions ?? 0)));
  const clicks = Math.max(0, Math.round(Number(row.clicks ?? 0)));
  const conversions = Math.max(0, Math.round(Number(row.conversions ?? 0)));
  const reportedValue = Number(row.purchaseValue ?? 0);
  return {
    spend,
    impressions,
    clicks,
    conversions,
    revenue: reportedValue,
    cpc: row.cpc == null ? null : Number(row.cpc),
    ctr: row.ctr == null ? null : Number(row.ctr),
    cpm: row.cpm == null ? null : Number(row.cpm),
    roas: reportedValue > 0 && spend > 0 ? reportedValue / spend : null,
  };
}

function safeProviderCounts(result: Record<string, unknown>) {
  const source = asRecord(result.counts);
  const totals = { found: 0, created: 0, updated: 0, skipped: 0, failed: 0 };
  const add = (value: unknown) => {
    const row = asRecord(value);
    for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
      const number = Number(row[key] ?? 0);
      if (Number.isFinite(number)) totals[key] += number;
    }
  };
  add(source);
  for (const value of Object.values(source)) add(value);
  return totals;
}

function sanitizeWarnings(result: Record<string, unknown>) {
  return Array.isArray(result.warnings)
    ? result.warnings
        .slice(0, 10)
        .map(() => 'Provider reported a sync warning. Review connection settings.')
    : [];
}

function syncProviderResult(
  provider: IntegrationProvider,
  status: 'success' | 'failed',
  startedAt: Date,
  counts: ReturnType<typeof safeProviderCounts> | null,
  warnings: string[],
) {
  const finishedAt = new Date();
  return {
    provider,
    status,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    duration: finishedAt.getTime() - startedAt.getTime(),
    found: counts?.found ?? 0,
    created: counts?.created ?? 0,
    updated: counts?.updated ?? 0,
    skipped: counts?.skipped ?? 0,
    failed: status === 'failed' ? Math.max(1, counts?.failed ?? 0) : (counts?.failed ?? 0),
    warnings,
  };
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
    return {
      connectionName: dto.connectionName?.trim() || 'Meta Ads',
      accountId: dto.accountId ?? null,
      metadata: dto.metadata ?? {},
    };
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
  const report =
    'historicalOrders' in config
      ? (config as ReturnType<typeof shopifyScopeReport>)
      : shopifyScopeReport(Array.isArray(config.scopes) ? config.scopes.map(String) : []);
  if (report.historicalOrders.satisfied) return [];
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

function normalizeShopifyScope(scope: string) {
  return scope.trim().toLowerCase();
}

function shopifyScopeReport(scopes: string[]) {
  const granted = Array.from(new Set(scopes.map(normalizeShopifyScope).filter(Boolean)));
  const satisfies = (scope: string) => {
    const normalized = normalizeShopifyScope(scope);
    const writeEquivalent = normalized.replace(/^read_/, 'write_');
    const customerEquivalent = normalized.replace(/^read_/, 'customer_read_');
    const customerWriteEquivalent = normalized.replace(/^read_/, 'customer_write_');
    const satisfiedBy = granted.find((grant) =>
      [normalized, writeEquivalent, customerEquivalent, customerWriteEquivalent].includes(grant),
    );
    return {
      scope: normalized,
      satisfied: Boolean(satisfiedBy),
      satisfiedBy: satisfiedBy ?? null,
      broaderGrant: Boolean(satisfiedBy && satisfiedBy !== normalized),
    };
  };
  const required = SHOPIFY_REQUIRED_SCOPES.map(satisfies);
  const optional = SHOPIFY_OPTIONAL_SCOPES.map(satisfies);
  const historicalOrders = satisfies(SHOPIFY_FULL_HISTORY_SCOPE);
  return {
    granted,
    required,
    optional,
    missingRequired: required.filter((item) => !item.satisfied).map((item) => item.scope),
    missingOptional: optional.filter((item) => !item.satisfied).map((item) => item.scope),
    broaderGranted: required
      .filter((item) => item.broaderGrant)
      .map((item) => `${item.scope} satisfied by ${item.satisfiedBy}`),
    historicalOrders,
  };
}

function shopifyScopeWarnings(scopes: string[]) {
  const report = shopifyScopeReport(scopes);
  return shopifyOperatorScopeWarnings(report);
}

function shopifyOperatorScopeWarnings(report: ReturnType<typeof shopifyScopeReport>) {
  return [...report.missingRequired.map((scope) => `Required Shopify scope missing: ${scope}.`)];
}

function resourceStats(found: number): ShopifyResourceSyncStats {
  return { found, created: 0, updated: 0, skipped: 0, failed: 0 };
}

function shopifyDryRunStats(found: {
  products: number;
  customers: number;
  orders: number;
}): ShopifySyncStats {
  return {
    products: resourceStats(found.products),
    customers: resourceStats(found.customers),
    orders: resourceStats(found.orders),
  };
}

function shopifyRunStatus(stats: ShopifySyncStats, _warnings: string[]): 'SUCCESS' | 'FAILED' {
  const failed = Object.values(stats).some((item) => item.failed > 0);
  if (failed) return 'FAILED';
  return 'SUCCESS';
}

function shopifySyncOutput(input: {
  shopDomain: string;
  stats: ShopifySyncStats;
  pages: Record<string, number>;
  warnings: string[];
  syncRange: Record<string, unknown>;
  startedAt: Date;
  finishedAt: Date;
}) {
  return {
    shopDomain: input.shopDomain,
    products: input.stats.products,
    customers: input.stats.customers,
    orders: input.stats.orders,
    totals: {
      products: input.stats.products.found,
      customers: input.stats.customers.found,
      orders: input.stats.orders.found,
    },
    pages: input.pages,
    warnings: input.warnings,
    syncRange: input.syncRange,
    startedAt: input.startedAt.toISOString(),
    finishedAt: input.finishedAt.toISOString(),
    status: input.warnings.length ? 'success_with_warnings' : 'success',
  };
}

function syncOutputTotals(output: Record<string, unknown>) {
  return ['products', 'customers', 'orders'].reduce<
    Record<
      string,
      { found: number; created: number; updated: number; skipped: number; failed: number }
    >
  >((totals, key) => {
    const resource = asRecord(output[key]);
    const nestedTotals = asRecord(output.totals);
    totals[key] = {
      found: Number(resource.found ?? nestedTotals[key] ?? 0),
      created: Number(resource.created ?? 0),
      updated: Number(resource.updated ?? 0),
      skipped: Number(resource.skipped ?? 0),
      failed: Number(resource.failed ?? 0),
    };
    return totals;
  }, {});
}

function decimalFromString(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function shopifyProviderStatus(order: ShopifyOrder) {
  if (order.cancelled_at) return 'cancelled';
  if (order.fulfillment_status) return String(order.fulfillment_status);
  if (order.financial_status) return String(order.financial_status);
  return order.confirmed ? 'confirmed' : 'open';
}

function integrationFailureMessage(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'The provider could not complete the requested sync.';
  return message
    .replace(/shpat_[A-Za-z0-9_:-]+/g, '[redacted]')
    .replace(/shpss_[A-Za-z0-9_:-]+/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._:-]+/gi, 'Bearer [redacted]')
    .slice(0, 600);
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

async function shopifyCustomerExists(
  prisma: PrismaService,
  organizationId: string,
  customer: ShopifyCustomer,
) {
  const address = customer.default_address;
  const phone = customer.phone || address?.phone || `shopify-${customer.id}`;
  const existing = await prisma.customer.findUnique({
    where: { organizationId_phone: { organizationId, phone } },
    select: { id: true },
  });
  return Boolean(existing);
}

async function findShopifyProductForLineItem(
  prisma: PrismaService,
  organizationId: string,
  item: ShopifyOrderLineItem,
) {
  const productExternalId = item.product_id ? `shopify-product-${item.product_id}` : null;
  if (productExternalId) {
    const product = await prisma.product.findUnique({
      where: { organizationId_externalId: { organizationId, externalId: productExternalId } },
      select: { id: true, sku: true },
    });
    if (product) return product;
  }

  const sku = item.sku?.trim();
  if (!sku) return null;
  return prisma.product.findFirst({
    where: { organizationId, sku },
    select: { id: true, sku: true },
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
  line_items?: ShopifyOrderLineItem[];
}

interface ShopifyOrderLineItem {
  id?: number | string;
  product_id?: number | string;
  variant_id?: number | string;
  name?: string;
  title?: string;
  sku?: string;
  quantity?: number;
  price?: string;
}
