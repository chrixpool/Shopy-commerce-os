import { Module } from '@nestjs/common';
import { PrismaModule } from '../../core/prisma/prisma.module';
import { ConfirmationController } from './confirmation.controller';
import { DeliveryController } from './delivery.controller';
import { FulfillmentController } from './fulfillment.controller';
import { WorkflowsService } from './workflows.service';

@Module({
  imports: [PrismaModule],
  controllers: [ConfirmationController, FulfillmentController, DeliveryController],
  providers: [WorkflowsService],
})
export class WorkflowsModule {}
