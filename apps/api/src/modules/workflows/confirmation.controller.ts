import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, InternalAuthGuard, type SessionUser } from '../../core/auth';
import { UpdateConfirmationDto } from './dto/update-confirmation.dto';
import { WorkflowsService } from './workflows.service';

@UseGuards(InternalAuthGuard)
@Controller('confirmation')
export class ConfirmationController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  list(
    @CurrentUser() user: SessionUser,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.workflowsService.listConfirmation(user.organizationId, {
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      status,
      search,
    });
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
