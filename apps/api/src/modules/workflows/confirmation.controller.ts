import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser, InternalAuthGuard, type SessionUser } from '../../core/auth';
import { UpdateConfirmationDto } from './dto/update-confirmation.dto';
import { WorkflowsService } from './workflows.service';

@UseGuards(InternalAuthGuard)
@Controller('confirmation')
export class ConfirmationController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.workflowsService.listConfirmation(user.organizationId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateConfirmationDto,
  ) {
    return this.workflowsService.updateConfirmation(user.organizationId, user.id, id, dto.action);
  }
}
