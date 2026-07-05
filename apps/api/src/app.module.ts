import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './core/prisma/prisma.module';
import { HealthModule } from './core/health/health.module';
import { AuthModule } from './modules/auth/auth.module';
import { TeamModule } from './modules/team/team.module';
import { ShopifyModule } from './modules/shopify/shopify.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { OrdersModule } from './modules/orders/orders.module';
import { WorkflowsModule } from './modules/workflows/workflows.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SettingsModule } from './modules/settings/settings.module';
import { IntegrationsModule } from './modules/integrations/integrations.module';
import { AutomationsModule } from './modules/automations/automations.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    BullModule.forRoot({
      connection: {
        url: process.env.REDIS_URL ?? 'redis://localhost:6379',
      },
    }),
    PrismaModule,
    HealthModule,
    // Phase 1
    AuthModule,
    TeamModule,
    DashboardModule,
    OrdersModule,
    WorkflowsModule,
    InventoryModule,
    SettingsModule,
    IntegrationsModule,
    AutomationsModule,
    // Phase 2
    ShopifyModule,
  ],
})
export class AppModule {}
