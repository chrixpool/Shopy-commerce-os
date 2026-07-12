import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { Role } from '@shopy/shared';
import { CurrentUser, InternalAuthGuard, RequireRole, type SessionUser } from '../../core/auth';
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
    return this.workflowsService.updateConfirmation(user.organizationId, user.id, id, dto);
  }
}

@UseGuards(InternalAuthGuard)
@Controller('workflows/reconciliation')
export class WorkflowReconciliationController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  @RequireRole(Role.ADMIN)
  get(@CurrentUser() user: SessionUser) {
    return this.workflowsService.reconciliation(user.organizationId);
  }

  @Post('repair')
  @RequireRole(Role.ADMIN)
  repair(@CurrentUser() user: SessionUser, @Body() body: Record<string, unknown>) {
    return this.workflowsService.repairReconciliation(user.organizationId, user.id, body);
  }
}
