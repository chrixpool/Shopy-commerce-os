import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IntegrationProvider } from '@prisma/client';
import { CurrentUser, InternalAuthGuard, Public, type SessionUser } from '../../core/auth';
import { ConnectIntegrationDto, SyncIntegrationDto } from './dto/connect-integration.dto';
import { CreateDraftActionDto, UpdateDraftActionStatusDto } from './dto/draft-action.dto';
import { IntegrationsService } from './integrations.service';

@UseGuards(InternalAuthGuard)
@Controller()
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Get('integrations')
  list(@CurrentUser() user: SessionUser) {
    return this.integrationsService.list(user.organizationId);
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
    return this.integrationsService.connect(user.organizationId, parseProvider(provider), dto);
  }

  @Post('integrations/:provider/test')
  test(@CurrentUser() user: SessionUser, @Param('provider') provider: string) {
    return this.integrationsService.test(user.organizationId, parseProvider(provider));
  }

  @Post('integrations/:provider/sync')
  sync(
    @CurrentUser() user: SessionUser,
    @Param('provider') provider: string,
    @Body() dto: SyncIntegrationDto,
  ) {
    return this.integrationsService.sync(user.organizationId, parseProvider(provider), dto);
  }

  @Get('integrations/:provider/sync-runs')
  syncRuns(@CurrentUser() user: SessionUser, @Param('provider') provider: string) {
    return this.integrationsService.syncRuns(user.organizationId, parseProvider(provider));
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

@Controller('webhooks')
export class IntegrationWebhooksController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Public()
  @Post('shopify')
  shopify(@Headers() headers: Record<string, string | undefined>, @Body() payload: unknown) {
    return this.integrationsService.handleShopifyWebhook(headers, payload);
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
