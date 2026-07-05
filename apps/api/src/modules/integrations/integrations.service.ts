import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  DraftActionStatus,
  IntegrationMode,
  IntegrationProvider,
  IntegrationStatus,
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
        credentials: asRecord(integration.encryptedCredentials),
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
    const encryptedCredentials: Record<string, unknown> = {};
    if (dto.accessToken) encryptedCredentials.accessToken = this.secrets.encrypt(dto.accessToken);

    const config = providerConfig(provider, dto);
    const test = await adapter.testConnection({
      organizationId,
      config,
      credentials: encryptedCredentials,
    });

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
    return this.adapter(provider).testConnection(current?.connection ?? null);
  }

  async sync(organizationId: string, provider: IntegrationProvider, dto: SyncIntegrationDto = {}) {
    const current = await this.connection(organizationId, provider);
    if (!current) throw new NotFoundException(`${provider} is not connected`);
    const dryRun = dto.dryRun ?? process.env.AUTOMATION_DRY_RUN_DEFAULT !== 'false';
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

  async handleShopifyWebhook(headers: Record<string, string | undefined>, payload: unknown) {
    const topic = headers['x-shopify-topic'] ?? 'unknown';
    const shopDomain = headers['x-shopify-shop-domain'];
    const organizationId = headers['x-shopy-organization-id'];
    if (!organizationId) throw new BadRequestException('Missing x-shopy-organization-id');

    const raw = JSON.stringify(payload ?? {});
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

function sanitizeConfig(value: unknown) {
  const config = asRecord(value);
  return Object.fromEntries(
    Object.entries(config).filter(([key]) => !key.toLowerCase().includes('token')),
  );
}

function providerConfig(provider: IntegrationProvider, dto: ConnectIntegrationDto) {
  if (provider === IntegrationProvider.SHOPIFY) {
    return {
      shopDomain: normalizeShopDomain(dto.shopDomain) ?? null,
      apiVersion: dto.apiVersion || '2025-01',
    };
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
