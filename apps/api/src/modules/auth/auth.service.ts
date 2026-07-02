import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    // If an invitation token is provided, use the invited org + role
    if (dto.invitationToken) {
      return this.registerViaInvitation(dto, passwordHash);
    }

    const baseSlug = dto.organizationName
      ? dto.organizationName
          .toLowerCase()
          .replace(/\s+/g, '-')
          .replace(/[^a-z0-9-]/g, '')
      : `org-${Date.now()}`;
    const existingSlug = await this.prisma.organization.findUnique({
      where: { slug: baseSlug },
      select: { id: true },
    });
    const slug = existingSlug ? `${baseSlug}-${Date.now()}` : baseSlug;

    const user = await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({
        data: { name: dto.organizationName ?? 'My Store', slug },
      });

      return tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: 'OWNER',
          organizationId: org.id,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          organizationId: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      });
    });

    return user;
  }

  private async registerViaInvitation(dto: RegisterDto, passwordHash: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { token: dto.invitationToken },
      include: { organization: true },
    });

    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') {
      throw new BadRequestException('Invitation has already been used or expired');
    }
    if (invitation.expiresAt < new Date()) {
      await this.prisma.invitation.update({
        where: { id: invitation.id },
        data: { status: 'EXPIRED' },
      });
      throw new BadRequestException('Invitation has expired');
    }
    if (invitation.email !== dto.email) {
      throw new BadRequestException('Email does not match invitation');
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          passwordHash,
          role: invitation.role,
          organizationId: invitation.organizationId,
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          organizationId: true,
          organization: { select: { id: true, name: true, slug: true } },
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { status: 'ACCEPTED' },
      });

      return created;
    });

    return user;
  }

  async validateCredentials(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        organizationId: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      organization: user.organization,
    };
  }

  async getUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        organizationId: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
    });
  }
}
