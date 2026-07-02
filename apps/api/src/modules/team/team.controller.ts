import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { TeamService } from './team.service';
import { InviteDto } from './dto/invite.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { CurrentUser, InternalAuthGuard, RequireRole } from '../../core/auth';
import type { SessionUser } from '../../core/auth';
import { Role } from '@shopy/shared';

@ApiTags('team')
@ApiBearerAuth()
@UseGuards(InternalAuthGuard)
@Controller('team')
export class TeamController {
  constructor(private readonly teamService: TeamService) {}

  @Get()
  @ApiOperation({ summary: 'List all team members' })
  getTeam(@CurrentUser() user: SessionUser) {
    return this.teamService.getTeam(user.organizationId);
  }

  @Get('members')
  @ApiOperation({ summary: 'List all team members' })
  getMembers(@CurrentUser() user: SessionUser) {
    return this.teamService.getTeam(user.organizationId);
  }

  @Get('invitations')
  @RequireRole(Role.ADMIN)
  @ApiOperation({ summary: 'List all invitations' })
  getInvitations(@CurrentUser() user: SessionUser) {
    return this.teamService.getInvitations(user.organizationId);
  }

  @Post('invitations')
  @RequireRole(Role.ADMIN)
  @ApiOperation({ summary: 'Invite a new team member' })
  createInvitation(@CurrentUser() user: SessionUser, @Body() dto: InviteDto) {
    return this.teamService.invite(user.organizationId, user.id, dto);
  }

  @Post('invite')
  @RequireRole(Role.ADMIN)
  @ApiOperation({ summary: 'Invite a new team member' })
  invite(@CurrentUser() user: SessionUser, @Body() dto: InviteDto) {
    return this.teamService.invite(user.organizationId, user.id, dto);
  }

  @Delete('invitations/:id')
  @RequireRole(Role.ADMIN)
  @ApiOperation({ summary: 'Revoke a pending invitation' })
  revokeInvitation(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.teamService.revokeInvitation(user.organizationId, id);
  }

  @Patch(':id/role')
  @RequireRole(Role.ADMIN)
  @ApiOperation({ summary: 'Update a member role' })
  updateRole(
    @CurrentUser() user: SessionUser,
    @Param('id') targetId: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.teamService.updateRole(user.organizationId, user.id, targetId, dto);
  }

  @Delete(':id')
  @RequireRole(Role.ADMIN)
  @ApiOperation({ summary: 'Remove a team member' })
  removeMember(@CurrentUser() user: SessionUser, @Param('id') targetId: string) {
    return this.teamService.removeMember(user.organizationId, user.id, targetId);
  }

  @Get('invitations/validate/:token')
  @ApiOperation({ summary: 'Validate an invitation token (public, used at signup)' })
  validateToken(@Param('token') token: string) {
    return this.teamService.validateInvitationToken(token);
  }
}
