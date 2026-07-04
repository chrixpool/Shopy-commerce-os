import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { normalizeCurrencyCode } from '@shopy/shared';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { UpdateOrganizationDto } from './dto/update-organization.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrganization(organizationId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: { id: organizationId },
      select: {
        id: true,
        name: true,
        slug: true,
        baseCurrency: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!organization) throw new NotFoundException('Organization not found');
    return organization;
  }

  async updateOrganization(organizationId: string, dto: UpdateOrganizationDto) {
    if (dto.slug) {
      const existing = await this.prisma.organization.findUnique({
        where: { slug: dto.slug },
        select: { id: true },
      });
      if (existing && existing.id !== organizationId) {
        throw new ConflictException('Organization slug is already in use');
      }
    }

    return this.prisma.organization.update({
      where: { id: organizationId },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(dto.slug ? { slug: dto.slug } : {}),
        ...(dto.baseCurrency ? { baseCurrency: normalizeCurrencyCode(dto.baseCurrency) } : {}),
      },
      select: {
        id: true,
        name: true,
        slug: true,
        baseCurrency: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async getIntegrations(organizationId: string) {
    const integrations = await this.prisma.integration.findMany({
      where: { organizationId },
      orderBy: { provider: 'asc' },
    });

    return [
      {
        provider: 'shopify',
        label: 'Shopify',
        isActive: integrations.some(
          (integration) => integration.provider === 'shopify' && integration.isActive,
        ),
        source: 'integration',
      },
      {
        provider: 'local-db',
        label: 'Local DB',
        isActive: true,
        source: 'system',
      },
      {
        provider: 'csv-import',
        label: 'CSV import',
        isActive: true,
        source: 'system',
      },
      {
        provider: 'manual-workflows',
        label: 'Manual workflows',
        isActive: true,
        source: 'system',
      },
      {
        provider: 'auth',
        label: 'Auth',
        isActive: true,
        source: 'system',
      },
      {
        provider: 'email',
        label: 'Email',
        isActive: false,
        source: 'disabled-free-local-invite-links',
      },
      {
        provider: 'sms-whatsapp-api',
        label: 'SMS/WhatsApp API',
        isActive: false,
        source: 'disabled-click-links-only',
      },
      {
        provider: 'ai-api',
        label: 'AI API',
        isActive: false,
        source: 'disabled-local-rules-only',
      },
      ...integrations
        .filter((integration) => integration.provider !== 'shopify')
        .map((integration) => ({
          provider: integration.provider,
          label: integration.provider,
          isActive: integration.isActive,
          source: 'integration',
          lastSyncAt: integration.lastSyncAt,
        })),
    ];
  }
}
