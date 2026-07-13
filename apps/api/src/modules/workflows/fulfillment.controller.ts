import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser, InternalAuthGuard, type SessionUser } from '../../core/auth';
import { UpdateFulfillmentDto } from './dto/update-fulfillment.dto';
import { WorkflowsService } from './workflows.service';

@UseGuards(InternalAuthGuard)
@Controller('fulfillment')
export class FulfillmentController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.workflowsService.listFulfillment(user.organizationId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateFulfillmentDto,
  ) {
    return this.workflowsService.updateFulfillment(user.organizationId, user, id, dto.status);
  }
}
