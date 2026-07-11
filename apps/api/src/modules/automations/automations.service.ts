import { Injectable, NotFoundException } from '@nestjs/common';
import {
  AutomationRunStatus,
  DraftActionStatus,
  IntegrationProvider,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../../core/prisma/prisma.service';
import type { CreateAutomationDto, UpdateAutomationDto } from './dto/automation.dto';

const TEMPLATES = [
  {
    name: 'Flag orders not confirmed after 24h',
    triggerType: 'confirmation_delayed',
    actionType: 'create_smart_suggestion',
    provider: IntegrationProvider.MANUAL,
  },
  {
    name: 'Suggest restock when stock drops below threshold',
    triggerType: 'low_stock_detected',
    actionType: 'recommend_inventory_restock',
    provider: IntegrationProvider.MANUAL,
  },
  {
    name: 'Create delivery follow-up for failed parcels',
    triggerType: 'delivery_failed',
    actionType: 'recommend_delivery_followup',
    provider: IntegrationProvider.MANUAL,
  },
  {
    name: 'Review campaigns with high spend and low orders',
    triggerType: 'meta_campaign_synced',
    actionType: 'recommend_campaign_review',
    provider: IntegrationProvider.META_ADS,
  },
  {
    name: 'Draft social post for best-selling product',
    triggerType: 'order_created',
    actionType: 'create_draft_action',
    provider: IntegrationProvider.INSTAGRAM,
  },
];

@Injectable()
export class AutomationsService {
  constructor(private readonly prisma: PrismaService) {}

  templates() {
    return TEMPLATES;
  }

  list(organizationId: string) {
    return this.prisma.automation.findMany({
      where: { organizationId },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
  }

  create(organizationId: string, dto: CreateAutomationDto) {
    return this.prisma.automation.create({
      data: {
        organizationId,
        name: dto.name,
        enabled: dto.enabled ?? true,
        isActive: dto.enabled ?? true,
        provider: (dto.provider as IntegrationProvider | undefined) ?? IntegrationProvider.MANUAL,
        triggerType: dto.triggerType,
        actionType: dto.actionType,
        dryRun: dto.dryRun ?? true,
        approvalRequired: dto.approvalRequired ?? true,
        conditions: (dto.conditions ?? {}) as Prisma.InputJsonValue,
        actionConfig: (dto.actionConfig ?? {}) as Prisma.InputJsonValue,
        trigger: {
          type: dto.triggerType,
          conditions: dto.conditions ?? {},
        } as Prisma.InputJsonValue,
        actions: [
          { type: dto.actionType, params: dto.actionConfig ?? {} },
        ] as Prisma.InputJsonValue,
      },
    });
  }

  async update(organizationId: string, id: string, dto: UpdateAutomationDto) {
    const automation = await this.prisma.automation.findFirst({ where: { id, organizationId } });
    if (!automation) throw new NotFoundException('Automation not found');
    return this.prisma.automation.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name } : {}),
        ...(typeof dto.enabled === 'boolean'
          ? { enabled: dto.enabled, isActive: dto.enabled }
          : {}),
        ...(typeof dto.dryRun === 'boolean' ? { dryRun: dto.dryRun } : {}),
        ...(typeof dto.approvalRequired === 'boolean'
          ? { approvalRequired: dto.approvalRequired }
          : {}),
        ...(dto.conditions ? { conditions: dto.conditions as Prisma.InputJsonValue } : {}),
        ...(dto.actionConfig ? { actionConfig: dto.actionConfig as Prisma.InputJsonValue } : {}),
      },
    });
  }

  async run(organizationId: string, id: string, dryRunOverride?: boolean) {
    const automation = await this.prisma.automation.findFirst({ where: { id, organizationId } });
    if (!automation) throw new NotFoundException('Automation not found');
    const dryRun = dryRunOverride ?? automation.dryRun;

    const run = await this.prisma.automationRun.create({
      data: {
        organizationId,
        automationId: automation.id,
        status: AutomationRunStatus.SUCCESS,
        dryRun,
        inputSnapshot: {
          triggerType: automation.triggerType,
          conditions: automation.conditions,
        },
        outputSnapshot: {
          actionType: automation.actionType,
          message: dryRun
            ? 'Dry run completed. No external write was executed.'
            : 'Automation created an internal draft only.',
        },
        finishedAt: new Date(),
      },
    });

    let draftAction = null;
    if (automation.actionType === 'create_draft_action' || automation.approvalRequired) {
      draftAction = await this.prisma.draftAction.create({
        data: {
          organizationId,
          provider: automation.provider ?? IntegrationProvider.MANUAL,
          actionType: automation.actionType ?? 'create_smart_suggestion',
          title: automation.name,
          summary: dryRun
            ? 'Dry-run draft generated for review. Nothing external was changed.'
            : 'Draft generated for approval. External execution is disabled in this phase.',
          payload: {
            automationId: automation.id,
            runId: run.id,
            dryRun,
          },
          status: DraftActionStatus.PENDING_APPROVAL,
        },
      });
    }

    await this.prisma.automation.update({
      where: { id: automation.id },
      data: {
        lastRunAt: new Date(),
        lastStatus: 'SUCCESS',
        errorMessage: null,
        runCount: { increment: 1 },
      },
    });

    return { run, draftAction };
  }

  test(organizationId: string, id: string) {
    return this.run(organizationId, id, true);
  }

  runs(organizationId: string) {
    return this.prisma.automationRun.findMany({
      where: { organizationId },
      orderBy: { startedAt: 'desc' },
      take: 50,
      include: { automation: { select: { name: true, triggerType: true, actionType: true } } },
    });
  }

  async deleteSmoke(organizationId: string, id: string) {
    const automation = await this.prisma.automation.findFirst({
      where: { id, organizationId, name: { startsWith: 'SMOKE:' } },
      select: { id: true },
    });
    if (!automation) throw new NotFoundException('Smoke automation not found');

    await this.prisma.$transaction([
      this.prisma.draftAction.deleteMany({
        where: { organizationId, title: { startsWith: 'SMOKE:' } },
      }),
      this.prisma.automationRun.deleteMany({ where: { automationId: id, organizationId } }),
      this.prisma.automation.delete({ where: { id } }),
    ]);
    return { deleted: true };
  }
}
