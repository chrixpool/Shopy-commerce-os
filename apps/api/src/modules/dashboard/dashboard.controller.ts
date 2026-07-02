import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, InternalAuthGuard, type SessionUser } from '../../core/auth';
import { DashboardService } from './dashboard.service';

@ApiTags('dashboard')
@UseGuards(InternalAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Get organization dashboard summary' })
  getSummary(@CurrentUser() user: SessionUser) {
    return this.dashboardService.getSummary(user.organizationId);
  }
}
