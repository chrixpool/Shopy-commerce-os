import { Module } from '@nestjs/common';
import { IntegrationsController, IntegrationWebhooksController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationSecretsService } from './crypto/integration-secrets.service';

@Module({
  controllers: [IntegrationsController, IntegrationWebhooksController],
  providers: [IntegrationsService, IntegrationSecretsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
