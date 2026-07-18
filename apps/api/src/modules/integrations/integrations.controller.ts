import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { IntegrationProvider } from '@prisma/client';
import { ROLE_HIERARCHY, Role } from '@shopy/shared';
import {
  CurrentUser,
  InternalAuthGuard,
  Public,
  RequireRole,
  type SessionUser,
} from '../../core/auth';
import { ConnectIntegrationDto, SyncIntegrationDto } from './dto/connect-integration.dto';
import { CreateDraftActionDto, UpdateDraftActionStatusDto } from './dto/draft-action.dto';
import { IntegrationsService } from './integrations.service';
import { MesColisService } from './mes-colis.service';

@UseGuards(InternalAuthGuard)
@Controller()
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get('integrations')
  list(@CurrentUser() user: SessionUser) {
    return this.integrationsService.list(user.organizationId);
  }

  @Post('integrations/sync-all')
  syncAll(@CurrentUser() user: SessionUser) {
    assertIntegrationManager(user);
    return this.integrationsService.startSyncAll(user.organizationId, user.id);
  }

  @Get('integrations/sync-all/runs')
  syncAllRuns(@CurrentUser() user: SessionUser) {
    return this.integrationsService.syncAllRuns(user.organizationId);
  }

  @Get('integrations/sync-all/:runId')
  syncAllRun(@CurrentUser() user: SessionUser, @Param('runId') runId: string) {
    return this.integrationsService.syncAllRun(user.organizationId, runId);
  }

  @Get('integrations/shopify/verification')
  verifyShopify(@CurrentUser() user: SessionUser) {
    return this.integrationsService.verifyShopify(user.organizationId);
  }

  @Get('integrations/:provider')
  get(@CurrentUser() user: SessionUser, @Param('provider') provider: string) {
    return this.integrationsService.get(user.organizationId, parseProvider(provider));
  }

  @Post('integrations/:provider/connect')
  connect(
    @CurrentUser() user: SessionUser,
    @Param('provider') provider: string,
    @Body() dto: ConnectIntegrationDto,
  ) {
    assertIntegrationManager(user);
    return this.integrationsService.connect(user.organizationId, parseProvider(provider), dto);
  }

  @Post('integrations/:provider/test')
  test(@CurrentUser() user: SessionUser, @Param('provider') provider: string) {
    assertIntegrationManager(user);
    return this.integrationsService.test(user.organizationId, parseProvider(provider));
  }

  @Get('integrations/meta-ads/accounts')
  metaAccounts(@CurrentUser() user: SessionUser) {
    return this.integrationsService.metaAccounts(user.organizationId);
  }

  @Post('integrations/meta-ads/select-account')
  selectMetaAccount(@CurrentUser() user: SessionUser, @Body() dto: ConnectIntegrationDto) {
    assertIntegrationManager(user);
    if (!dto.accountId) throw new BadRequestException('Select an accessible ad account.');
    return this.integrationsService.selectMetaAccount(user.organizationId, dto.accountId);
  }

  @Post('integrations/:provider/sync')
  sync(
    @CurrentUser() user: SessionUser,
    @Param('provider') provider: string,
    @Body() dto: SyncIntegrationDto,
  ) {
    assertIntegrationManager(user);
    return this.integrationsService.sync(user.organizationId, parseProvider(provider), dto);
  }

  @Post('integrations/:provider/dry-run')
  dryRun(@CurrentUser() user: SessionUser, @Param('provider') provider: string) {
    assertIntegrationManager(user);
    return this.integrationsService.sync(user.organizationId, parseProvider(provider), {
      dryRun: true,
    });
  }

  @Get('integrations/:provider/sync-runs')
  syncRuns(@CurrentUser() user: SessionUser, @Param('provider') provider: string) {
    return this.integrationsService.syncRuns(user.organizationId, parseProvider(provider));
  }

  @Post('integrations/:provider/disconnect')
  disconnect(@CurrentUser() user: SessionUser, @Param('provider') provider: string) {
    assertIntegrationManager(user);
    return this.integrationsService.disconnect(user.organizationId, parseProvider(provider));
  }

  @Delete('integrations/:provider/disconnect')
  disconnectDelete(@CurrentUser() user: SessionUser, @Param('provider') provider: string) {
    assertIntegrationManager(user);
    return this.integrationsService.disconnect(user.organizationId, parseProvider(provider));
  }

  @Get('marketing/meta-ads/summary')
  metaSummary(@CurrentUser() user: SessionUser) {
    return this.integrationsService.marketingSummary(user.organizationId);
  }

  @Get('marketing/meta-ads/campaigns')
  metaCampaigns(@CurrentUser() user: SessionUser) {
    return this.integrationsService.campaigns(user.organizationId);
  }

  @Post('marketing/:provider/draft-action')
  draftMarketingAction(
    @CurrentUser() user: SessionUser,
    @Param('provider') provider: string,
    @Body() dto: CreateDraftActionDto,
  ) {
    return this.integrationsService.createDraftAction(
      user.organizationId,
      user.id,
      parseProvider(provider),
      dto,
    );
  }

  @Get('draft-actions')
  draftActions(@CurrentUser() user: SessionUser) {
    return this.integrationsService.listDraftActions(user.organizationId);
  }

  @Patch('draft-actions/:id/status')
  updateDraftAction(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateDraftActionStatusDto,
  ) {
    return this.integrationsService.updateDraftAction(user.organizationId, user.id, id, dto);
  }
}

@UseGuards(InternalAuthGuard)
@Controller('integrations/mes-colis')
export class MesColisController {
  constructor(private readonly mesColis: MesColisService) {}

  @Get()
  get(@CurrentUser() user: SessionUser) {
    return this.mesColis.get(user.organizationId);
  }

  @Post('connect')
  @RequireRole(Role.ADMIN)
  connect(@CurrentUser() user: SessionUser, @Body() body: Record<string, unknown>) {
    return this.mesColis.connect(user.organizationId, String(body.accessToken ?? ''));
  }

  @Post('test')
  @RequireRole(Role.ADMIN)
  test(@CurrentUser() user: SessionUser) {
    return this.mesColis.test(user.organizationId);
  }

  @Post('disconnect')
  @RequireRole(Role.ADMIN)
  disconnect(@CurrentUser() user: SessionUser) {
    return this.mesColis.disconnect(user.organizationId);
  }

  @Post('lookup')
  @RequireRole(Role.ADMIN)
  lookup(@CurrentUser() user: SessionUser, @Body() body: Record<string, unknown>) {
    return this.mesColis.lookup(user.organizationId, body);
  }

  @Post('sync-linked')
  @RequireRole(Role.ADMIN)
  syncLinked(@CurrentUser() user: SessionUser) {
    return this.mesColis.syncLinked(user.organizationId, user.id);
  }

  @Post('parcels/:id/refresh')
  @RequireRole(Role.ADMIN)
  refreshOne(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.mesColis.refreshOne(user.organizationId, id);
  }

  @Get('sync-runs')
  runs(@CurrentUser() user: SessionUser) {
    return this.mesColis.get(user.organizationId).then((value) => value.recentRuns);
  }

  @Get('parcels')
  parcels(@CurrentUser() user: SessionUser) {
    return this.mesColis.listParcels(user.organizationId);
  }

  @Get('mapping-review')
  review(@CurrentUser() user: SessionUser) {
    return this.mesColis.mappingReview(user.organizationId);
  }

  @Post('parcels/:id/link')
  @RequireRole(Role.ADMIN)
  link(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.mesColis.link(
      user.organizationId,
      user.id,
      id,
      String(body.orderReference ?? body.orderId ?? ''),
    );
  }

  @Delete('parcels/:id/link')
  @RequireRole(Role.ADMIN)
  unlink(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.mesColis.unlink(user.organizationId, user.id, id);
  }
}

@Controller('webhooks')
export class IntegrationWebhooksController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Public()
  @Post('shopify')
  shopify(
    @Headers() headers: Record<string, string | undefined>,
    @Body() payload: unknown,
    @Req() req: RawBodyRequest<Request>,
  ) {
    return this.integrationsService.handleShopifyWebhook(headers, payload, req.rawBody);
  }
}

function parseProvider(value: string) {
  const normalized = value.replace(/-/g, '_').toUpperCase();
  if (normalized === 'FACEBOOK') return IntegrationProvider.FACEBOOK_PAGE;
  if (normalized === 'META') return IntegrationProvider.META_ADS;
  if (!Object.values(IntegrationProvider).includes(normalized as IntegrationProvider)) {
    throw new BadRequestException(`Unsupported provider ${value}`);
  }
  return normalized as IntegrationProvider;
}

function assertIntegrationManager(user: SessionUser) {
  if (ROLE_HIERARCHY[user.role] < ROLE_HIERARCHY[Role.ADMIN]) {
    throw new ForbiddenException('Admin access is required to manage integrations.');
  }
}
