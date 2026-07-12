import { Module } from '@nestjs/common';
import {
  IntegrationsController,
  IntegrationWebhooksController,
  MesColisController,
} from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { IntegrationSecretsService } from './crypto/integration-secrets.service';
import { MesColisService } from './mes-colis.service';

@Module({
  controllers: [MesColisController, IntegrationsController, IntegrationWebhooksController],
  providers: [IntegrationsService, IntegrationSecretsService, MesColisService],
  exports: [IntegrationsService, IntegrationSecretsService, MesColisService],
})
export class IntegrationsModule {}
