import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser, InternalAuthGuard, type SessionUser } from '../../core/auth';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { WorkflowsService } from './workflows.service';

@UseGuards(InternalAuthGuard)
@Controller('delivery')
export class DeliveryController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.workflowsService.listDelivery(user.organizationId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateDeliveryDto,
  ) {
    return this.workflowsService.updateDelivery(user.organizationId, user.id, id, dto.status);
  }
}
