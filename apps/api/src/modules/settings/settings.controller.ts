import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser, InternalAuthGuard, type SessionUser } from '../../core/auth';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { SettingsService } from './settings.service';

@UseGuards(InternalAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('organization')
  getOrganization(@CurrentUser() user: SessionUser) {
    return this.settingsService.getOrganization(user.organizationId);
  }

  @Patch('organization')
  updateOrganization(@CurrentUser() user: SessionUser, @Body() dto: UpdateOrganizationDto) {
    return this.settingsService.updateOrganization(user.organizationId, dto);
  }

  @Get('integrations')
  getIntegrations(@CurrentUser() user: SessionUser) {
    return this.settingsService.getIntegrations(user.organizationId);
  }
}
