import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { InviteDto } from './dto/invite.dto';
import type { UpdateRoleDto } from './dto/update-role.dto';
import type { Role } from '@shopy/shared';
import { ROLE_HIERARCHY } from '@shopy/shared';

@Injectable()
export class TeamService {
  constructor(private readonly prisma: PrismaService) {}

  async getTeam(organizationId: string) {
    return this.prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async invite(organizationId: string, invitedById: string, dto: InviteDto) {
    // Check inviter role is higher than target role (can't invite someone to equal/higher role)
    const inviter = await this.prisma.user.findUnique({
      where: { id: invitedById },
      select: { role: true },
    });
    if (!inviter) throw new NotFoundException('Inviter not found');

    if (ROLE_HIERARCHY[inviter.role as Role] <= ROLE_HIERARCHY[dto.role as Role]) {
      throw new ForbiddenException('You cannot invite someone with equal or higher role');
    }

    // Check if user with this email already in org
    const existingUser = await this.prisma.user.findFirst({
      where: { email: dto.email, organizationId },
    });
    if (existingUser) {
      throw new ConflictException('User already a member of this organization');
    }

    // Check for pending invite to same email
    const existingInvite = await this.prisma.invitation.findFirst({
      where: { email: dto.email, organizationId, status: 'PENDING' },
    });
    if (existingInvite) {
      throw new ConflictException('A pending invitation already exists for this email');
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const invitation = await this.prisma.invitation.create({
      data: {
        email: dto.email,
        role: dto.role,
        organizationId,
        invitedById,
        expiresAt,
      },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    };
  }

  async getInvitations(organizationId: string) {
    return this.prisma.invitation.findMany({
      where: { organizationId },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        expiresAt: true,
        createdAt: true,
        invitedBy: { select: { name: true, email: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async revokeInvitation(organizationId: string, invitationId: string) {
    const invitation = await this.prisma.invitation.findFirst({
      where: { id: invitationId, organizationId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Only pending invitations can be revoked');
    }

    return this.prisma.invitation.update({
      where: { id: invitationId },
      data: { status: 'REVOKED' },
    });
  }

  async updateRole(
    organizationId: string,
    actorId: string,
    targetUserId: string,
    dto: UpdateRoleDto,
  ) {
    const actor = await this.prisma.user.findUnique({ where: { id: actorId } });
    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId },
    });
    if (!actor || !target) throw new NotFoundException('User not found');
    if (target.role === 'OWNER') throw new ForbiddenException('Cannot change the owner role');
    if (ROLE_HIERARCHY[actor.role as Role] <= ROLE_HIERARCHY[dto.role as Role]) {
      throw new ForbiddenException('Cannot assign a role equal to or higher than yours');
    }

    return this.prisma.user.update({
      where: { id: targetUserId },
      data: { role: dto.role },
      select: { id: true, name: true, email: true, role: true },
    });
  }

  async removeMember(organizationId: string, actorId: string, targetUserId: string) {
    if (actorId === targetUserId) throw new BadRequestException('Cannot remove yourself');

    const target = await this.prisma.user.findFirst({
      where: { id: targetUserId, organizationId },
    });
    if (!target) throw new NotFoundException('Member not found');
    if (target.role === 'OWNER') throw new ForbiddenException('Cannot remove the owner');

    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { organizationId: null },
    });

    return { success: true };
  }

  async validateInvitationToken(token: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token },
      include: { organization: { select: { name: true } } },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('This invitation is no longer valid');
    }
    if (invitation.expiresAt < new Date()) {
      throw new BadRequestException('This invitation has expired');
    }
    return {
      email: invitation.email,
      role: invitation.role,
      organizationName: invitation.organization.name,
      expiresAt: invitation.expiresAt,
    };
  }
}
