import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, InternalAuthGuard, type SessionUser } from '../../core/auth';
import { AutomationsService } from './automations.service';
import { CreateAutomationDto, UpdateAutomationDto } from './dto/automation.dto';

@UseGuards(InternalAuthGuard)
@Controller('automations')
export class AutomationsController {
  constructor(private readonly automationsService: AutomationsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.automationsService.list(user.organizationId);
  }

  @Get('templates')
  templates() {
    return this.automationsService.templates();
  }

  @Get('runs')
  runs(@CurrentUser() user: SessionUser) {
    return this.automationsService.runs(user.organizationId);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body() dto: CreateAutomationDto) {
    return this.automationsService.create(user.organizationId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id') id: string,
    @Body() dto: UpdateAutomationDto,
  ) {
    return this.automationsService.update(user.organizationId, id, dto);
  }

  @Post(':id/test')
  test(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.automationsService.test(user.organizationId, id);
  }

  @Post(':id/run')
  run(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.automationsService.run(user.organizationId, id);
  }
}
