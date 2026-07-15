import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { IntegrationProvider, IntegrationStatus, ParcelMatchState, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { PrismaService } from '../../core/prisma/prisma.service';
import { IntegrationSecretsService } from './crypto/integration-secrets.service';

const MES_COLIS_API = () => process.env.MES_COLIS_API_URL || 'https://api.mescolis.tn/api';
const MES_COLIS_SOCKET = () => process.env.MES_COLIS_SOCKET_URL || 'https://api.mescolis.tn:4001';

export const MES_COLIS_STATUSES = [
  'pending',
  'to-be-picked-up',
  'picked-up',
  'at-agency',
  'in-progress',
  'to-be-verified',
  'delivered',
  'delivered-and-paid',
  'exchanged',
  'refunded',
  'return-agency',
  'final-return',
  'return-inter-agency',
  'return-sender',
  'return-received',
  'inter-depot',
  'unavailable-1',
  'unavailable-2',
  'paiement-received',
  'order-refund',
  'saisie-douane',
  'anomalie',
] as const;

const STATUS_MAP: Record<string, string> = {
  pending: 'PENDING',
  'to-be-picked-up': 'AWAITING_PICKUP',
  'picked-up': 'PICKED_UP',
  'at-agency': 'IN_TRANSIT',
  'in-progress': 'OUT_FOR_DELIVERY',
  'to-be-verified': 'NEEDS_VERIFICATION',
  delivered: 'DELIVERED',
  'delivered-and-paid': 'DELIVERED_AND_PAID',
  exchanged: 'EXCHANGED',
  refunded: 'REFUNDED',
  'return-agency': 'RETURN_IN_PROGRESS',
  'final-return': 'RETURNED',
  'return-inter-agency': 'RETURN_IN_PROGRESS',
  'return-sender': 'RETURN_IN_PROGRESS',
  'return-received': 'RETURNED',
  'inter-depot': 'IN_TRANSIT',
  'unavailable-1': 'EXCEPTION',
  'unavailable-2': 'EXCEPTION',
  'paiement-received': 'DELIVERED_AND_PAID',
  'order-refund': 'REFUNDED',
  'saisie-douane': 'EXCEPTION',
  anomalie: 'EXCEPTION',
};

@Injectable()
export class MesColisService implements OnModuleInit, OnModuleDestroy {
  private readonly sockets = new Map<string, Socket>();
  private readonly socketState = new Map<
    string,
    { connected: boolean; lastEventAt: Date | null }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly secrets: IntegrationSecretsService,
  ) {}

  async onModuleInit() {
    const integrations = await this.prisma.integration.findMany({
      where: {
        provider: IntegrationProvider.MES_COLIS,
        isActive: true,
        status: IntegrationStatus.CONNECTED,
      },
      select: { organizationId: true, encryptedCredentials: true },
    });
    for (const integration of integrations) {
      const token = this.secrets.decrypt(asRecord(integration.encryptedCredentials).accessToken);
      if (token) this.startSocket(integration.organizationId, token);
    }
  }

  onModuleDestroy() {
    for (const socket of this.sockets.values()) socket.disconnect();
    this.sockets.clear();
  }

  async get(organizationId: string) {
    const row = await this.prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: IntegrationProvider.MES_COLIS },
      },
    });
    const recent = await this.prisma.automationRun.findMany({
      where: { organizationId, inputSnapshot: { path: ['provider'], equals: 'MES_COLIS' } },
      orderBy: { startedAt: 'desc' },
      take: 10,
      select: { id: true, status: true, startedAt: true, finishedAt: true, outputSnapshot: true },
    });
    const socket = this.socketState.get(organizationId);
    return {
      provider: 'MES_COLIS',
      status: row?.status ?? IntegrationStatus.DISCONNECTED,
      isActive: row?.isActive ?? false,
      accountReference: row ? 'Mes Colis account' : null,
      lastSyncAt: row?.lastSyncAt ?? null,
      lastTestAt: asDate(asRecord(row?.config).lastTestAt),
      lastFailedSyncAt: asDate(asRecord(row?.config).lastFailedSyncAt),
      socketHealth: socket?.connected
        ? 'connected'
        : row?.isActive
          ? 'reconnecting'
          : 'disconnected',
      lastSocketEventAt: socket?.lastEventAt ?? null,
      warningCount: row?.errorMessage ? 1 : 0,
      credentialSaved: Object.keys(asRecord(row?.encryptedCredentials)).length > 0,
      recentRuns: recent.map((run) => ({
        id: run.id,
        status: run.status,
        startedAt: run.startedAt,
        finishedAt: run.finishedAt,
        summary: safeTotals(run.outputSnapshot),
      })),
    };
  }

  async connect(organizationId: string, accessToken: string) {
    const token = accessToken.trim();
    if (!token) throw new BadRequestException('Mes Colis access token is required.');
    const tested = await this.testToken(token);
    if (!tested.ok) throw new BadRequestException(tested.message);
    const encryptedCredentials = { accessToken: this.secrets.encrypt(token) };
    const now = new Date();
    await this.prisma.integration.upsert({
      where: {
        organizationId_provider: { organizationId, provider: IntegrationProvider.MES_COLIS },
      },
      create: {
        organizationId,
        provider: IntegrationProvider.MES_COLIS,
        status: IntegrationStatus.CONNECTED,
        isActive: true,
        mode: 'READ_ONLY',
        credentials: {},
        encryptedCredentials: encryptedCredentials as unknown as Prisma.InputJsonValue,
        config: { lastTestAt: now.toISOString(), apiBaseUrl: MES_COLIS_API() },
      },
      update: {
        status: IntegrationStatus.CONNECTED,
        isActive: true,
        mode: 'READ_ONLY',
        errorMessage: null,
        credentials: {},
        encryptedCredentials: encryptedCredentials as unknown as Prisma.InputJsonValue,
        config: { lastTestAt: now.toISOString(), apiBaseUrl: MES_COLIS_API() },
      },
    });
    this.startSocket(organizationId, token);
    return this.get(organizationId);
  }

  async test(organizationId: string) {
    const token = await this.token(organizationId);
    const result = await this.testToken(token);
    await this.prisma.integration.update({
      where: {
        organizationId_provider: { organizationId, provider: IntegrationProvider.MES_COLIS },
      },
      data: {
        status: result.ok ? IntegrationStatus.CONNECTED : IntegrationStatus.ERROR,
        isActive: result.ok,
        errorMessage: result.ok ? null : result.message,
        config: await this.mergedConfig(organizationId, { lastTestAt: new Date().toISOString() }),
      },
    });
    return result;
  }

  async disconnect(organizationId: string) {
    this.sockets.get(organizationId)?.disconnect();
    this.sockets.delete(organizationId);
    this.socketState.delete(organizationId);
    await this.prisma.integration.upsert({
      where: {
        organizationId_provider: { organizationId, provider: IntegrationProvider.MES_COLIS },
      },
      create: {
        organizationId,
        provider: IntegrationProvider.MES_COLIS,
        credentials: {},
        encryptedCredentials: {},
      },
      update: {
        status: IntegrationStatus.DISCONNECTED,
        isActive: false,
        credentials: {},
        encryptedCredentials: {},
        errorMessage: null,
      },
    });
    return { disconnected: true };
  }

  async lookup(organizationId: string, body: Record<string, unknown>) {
    const barcode = cleanBarcode(body.barcode);
    const token = await this.token(organizationId);
    const payload = await this.getOrder(token, barcode);
    return this.ingest(organizationId, payload, {
      orderReference: typeof body.orderReference === 'string' ? body.orderReference : undefined,
      source: 'poll',
    });
  }

  async refreshOne(organizationId: string, providerParcelId: string) {
    const parcel = await this.prisma.providerParcel.findFirst({
      where: {
        id: providerParcelId,
        organizationId,
        provider: IntegrationProvider.MES_COLIS,
      },
      select: { barcode: true },
    });
    if (!parcel) throw new NotFoundException('Mes Colis tracking record not found.');
    const token = await this.token(organizationId);
    return this.ingest(organizationId, await this.getOrder(token, parcel.barcode), {
      source: 'poll',
    });
  }

  async syncLinked(organizationId: string) {
    const active = await this.prisma.automationRun.findFirst({
      where: {
        organizationId,
        status: { in: ['QUEUED', 'RUNNING'] },
        inputSnapshot: { path: ['provider'], equals: 'MES_COLIS' },
      },
    });
    if (active) return { runId: active.id, status: active.status, duplicatePrevented: true };
    const token = await this.token(organizationId);
    const run = await this.prisma.automationRun.create({
      data: {
        organizationId,
        status: 'RUNNING',
        dryRun: false,
        inputSnapshot: { provider: 'MES_COLIS', type: 'SYNC' },
      },
    });
    const providerRows = await this.prisma.providerParcel.findMany({
      where: { organizationId, provider: IntegrationProvider.MES_COLIS },
      select: { barcode: true },
    });
    const legacyRows = await this.prisma.parcel.findMany({
      where: {
        order: { organizationId },
        provider: { equals: 'mescolis', mode: 'insensitive' },
        trackingNumber: { not: null },
      },
      select: { trackingNumber: true },
    });
    const barcodes = Array.from(
      new Set([
        ...providerRows.map((row) => row.barcode),
        ...legacyRows
          .map((row) => row.trackingNumber)
          .filter((value): value is string => Boolean(value)),
      ]),
    );
    const totals = {
      linked: barcodes.length,
      matched: 0,
      updated: 0,
      unchanged: 0,
      unmatched: 0,
      conflicts: 0,
      failed: 0,
    };
    for (const barcode of barcodes) {
      try {
        const before = await this.prisma.providerParcel.findUnique({
          where: {
            organizationId_provider_barcode: {
              organizationId,
              provider: IntegrationProvider.MES_COLIS,
              barcode,
            },
          },
          select: { providerStatus: true, details: true },
        });
        const result = await this.ingest(organizationId, await this.getOrder(token, barcode), {
          source: 'poll',
        });
        if (result.matchState === ParcelMatchState.CONFLICT) totals.conflicts += 1;
        else if (result.orderId) totals.matched += 1;
        else totals.unmatched += 1;
        if (!before || before.providerStatus !== result.providerStatus) totals.updated += 1;
        else totals.unchanged += 1;
      } catch {
        totals.failed += 1;
      }
    }
    const status =
      totals.failed === 0 ? 'SUCCESS' : totals.failed === barcodes.length ? 'FAILED' : 'PARTIAL';
    await this.prisma.$transaction([
      this.prisma.automationRun.update({
        where: { id: run.id },
        data: {
          status: status === 'FAILED' ? 'FAILED' : 'SUCCESS',
          finishedAt: new Date(),
          outputSnapshot: { ...totals, status },
        },
      }),
      this.prisma.integration.update({
        where: {
          organizationId_provider: { organizationId, provider: IntegrationProvider.MES_COLIS },
        },
        data: {
          lastSyncAt: new Date(),
          ...(totals.failed
            ? {
                config: await this.mergedConfig(organizationId, {
                  lastFailedSyncAt: new Date().toISOString(),
                }),
              }
            : {}),
        },
      }),
    ]);
    return { runId: run.id, status, ...totals };
  }

  mappingReview(organizationId: string) {
    return this.prisma.providerParcel.findMany({
      where: {
        organizationId,
        provider: IntegrationProvider.MES_COLIS,
        matchState: { in: ['UNMATCHED', 'CONFLICT', 'HIGH_CONFIDENCE_FALLBACK'] },
      },
      select: {
        id: true,
        barcode: true,
        providerStatus: true,
        normalizedStatus: true,
        matchState: true,
        matchConfidence: true,
        matchReasons: true,
        lastProviderUpdateAt: true,
        orderId: true,
        details: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  async link(
    organizationId: string,
    userId: string,
    providerParcelId: string,
    orderReference: string,
  ) {
    const reference = orderReference.trim();
    if (!reference) throw new BadRequestException('Enter an exact Shopy order reference.');
    const [parcel, order] = await Promise.all([
      this.prisma.providerParcel.findFirst({ where: { id: providerParcelId, organizationId } }),
      this.prisma.order.findFirst({
        where: {
          organizationId,
          OR: [{ id: reference }, { orderNumber: reference }, { externalId: reference }],
        },
        select: { id: true },
      }),
    ]);
    if (!parcel || !order) throw new NotFoundException('Parcel or order not found.');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.providerParcel.update({
        where: { id: parcel.id },
        data: {
          orderId: order.id,
          matchState: ParcelMatchState.MANUAL,
          matchConfidence: 100,
          matchReasons: ['manual_operator_link'],
        },
      });
      await tx.orderEvent.create({
        data: {
          orderId: order.id,
          userId,
          type: 'mes_colis_linked',
          note: 'Mes Colis tracking linked manually',
          data: { providerParcelId: parcel.id, source: 'USER' },
        },
      });
      return safeParcel(updated);
    });
  }

  async unlink(organizationId: string, userId: string, providerParcelId: string) {
    const parcel = await this.prisma.providerParcel.findFirst({
      where: { id: providerParcelId, organizationId },
    });
    if (!parcel) throw new NotFoundException('Provider parcel not found.');
    if (parcel.orderId) {
      await this.prisma.orderEvent.create({
        data: {
          orderId: parcel.orderId,
          userId,
          type: 'mes_colis_unlinked',
          note: 'Mes Colis tracking link removed',
          data: { providerParcelId, source: 'USER' },
        },
      });
    }
    const updated = await this.prisma.providerParcel.update({
      where: { id: providerParcelId },
      data: {
        orderId: null,
        matchState: ParcelMatchState.UNMATCHED,
        matchConfidence: 0,
        matchReasons: [],
      },
    });
    return safeParcel(updated);
  }

  listParcels(organizationId: string) {
    return this.prisma.providerParcel.findMany({
      where: { organizationId, provider: IntegrationProvider.MES_COLIS },
      select: {
        id: true,
        barcode: true,
        orderId: true,
        providerStatus: true,
        normalizedStatus: true,
        matchState: true,
        matchConfidence: true,
        matchReasons: true,
        details: true,
        lastProviderUpdateAt: true,
        lastSyncedAt: true,
        events: {
          orderBy: { occurredAt: 'desc' },
          take: 25,
          select: {
            id: true,
            providerStatus: true,
            normalizedStatus: true,
            details: true,
            occurredAt: true,
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  private async ingest(
    organizationId: string,
    payload: Record<string, unknown>,
    context: { orderReference?: string; source: 'poll' | 'socket' },
  ) {
    const barcode = cleanBarcode(payload.barcode);
    const providerStatus = normalizeRawStatus(payload.status);
    const normalizedStatus = normalizeMesColisStatus(providerStatus);
    const details = safeDetails(payload);
    const occurredAt = parseDate(payload.updated_at) ?? new Date();
    const eventHash = createHash('sha256')
      .update(
        JSON.stringify({ barcode, providerStatus, occurredAt: occurredAt.toISOString(), details }),
      )
      .digest('hex');
    const match = await this.matchOrder(organizationId, barcode, context.orderReference);
    const existing = await this.prisma.providerParcel.findUnique({
      where: {
        organizationId_provider_barcode: {
          organizationId,
          provider: IntegrationProvider.MES_COLIS,
          barcode,
        },
      },
    });
    const providerParcel = await this.prisma.providerParcel.upsert({
      where: {
        organizationId_provider_barcode: {
          organizationId,
          provider: IntegrationProvider.MES_COLIS,
          barcode,
        },
      },
      create: {
        organizationId,
        provider: IntegrationProvider.MES_COLIS,
        barcode,
        providerStatus,
        normalizedStatus,
        orderId: match.orderId,
        matchState: match.state,
        matchConfidence: match.confidence,
        matchReasons: match.reasons,
        details: details as Prisma.InputJsonValue,
        lastProviderUpdateAt: occurredAt,
        lastSyncedAt: new Date(),
      },
      update: {
        providerStatus,
        normalizedStatus,
        ...(existing?.orderId
          ? {}
          : {
              orderId: match.orderId,
              matchState: match.state,
              matchConfidence: match.confidence,
              matchReasons: match.reasons,
            }),
        details: details as Prisma.InputJsonValue,
        lastProviderUpdateAt: occurredAt,
        lastSyncedAt: new Date(),
      },
    });
    await this.prisma.providerParcelEvent.upsert({
      where: { providerParcelId_eventHash: { providerParcelId: providerParcel.id, eventHash } },
      create: {
        providerParcelId: providerParcel.id,
        providerStatus,
        normalizedStatus,
        eventHash,
        details: details as Prisma.InputJsonValue,
        occurredAt,
      },
      update: {},
    });
    if (providerParcel.orderId && (!existing || existing.providerStatus !== providerStatus)) {
      await this.prisma.orderEvent.create({
        data: {
          orderId: providerParcel.orderId,
          type: 'mes_colis_status',
          note: `Mes Colis status updated to ${providerStatus}`,
          data: {
            providerParcelId: providerParcel.id,
            normalizedStatus,
            source: 'MES_COLIS',
            transport: context.source,
          },
        },
      });
    }
    return safeParcel(providerParcel);
  }

  private async matchOrder(organizationId: string, barcode: string, orderReference?: string) {
    const exactBarcode = await this.prisma.parcel.findFirst({
      where: { trackingNumber: barcode, order: { organizationId } },
      select: { orderId: true },
    });
    if (exactBarcode)
      return {
        orderId: exactBarcode.orderId,
        state: ParcelMatchState.EXACT_BARCODE,
        confidence: 100,
        reasons: ['exact_tracking_number'],
      };
    if (orderReference) {
      const matches = await this.prisma.order.findMany({
        where: {
          organizationId,
          OR: [{ orderNumber: orderReference }, { externalId: orderReference }],
        },
        select: { id: true },
        take: 2,
      });
      if (matches.length === 1 && matches[0])
        return {
          orderId: matches[0].id,
          state: ParcelMatchState.EXACT_ORDER_REFERENCE,
          confidence: 100,
          reasons: ['exact_order_reference'],
        };
      if (matches.length > 1)
        return {
          orderId: null,
          state: ParcelMatchState.CONFLICT,
          confidence: 0,
          reasons: ['duplicate_order_reference'],
        };
    }
    return { orderId: null, state: ParcelMatchState.UNMATCHED, confidence: 0, reasons: [] };
  }

  private startSocket(organizationId: string, token: string) {
    this.sockets.get(organizationId)?.disconnect();
    const socket = io(MES_COLIS_SOCKET(), {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      autoConnect: true,
    });
    this.sockets.set(organizationId, socket);
    this.socketState.set(organizationId, { connected: false, lastEventAt: null });
    socket.on('connect', () =>
      this.socketState.set(organizationId, {
        connected: true,
        lastEventAt: this.socketState.get(organizationId)?.lastEventAt ?? null,
      }),
    );
    socket.on('disconnect', () =>
      this.socketState.set(organizationId, {
        connected: false,
        lastEventAt: this.socketState.get(organizationId)?.lastEventAt ?? null,
      }),
    );
    socket.on('mescolis-events', (event: unknown) => {
      if (!isRecord(event)) return;
      const state = this.socketState.get(organizationId) ?? { connected: true, lastEventAt: null };
      this.socketState.set(organizationId, { ...state, lastEventAt: new Date() });
      void this.ingest(organizationId, event, { source: 'socket' }).catch(() => undefined);
    });
  }

  private async token(organizationId: string) {
    const row = await this.prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: IntegrationProvider.MES_COLIS },
      },
      select: { encryptedCredentials: true, status: true, isActive: true },
    });
    const token = this.secrets.decrypt(asRecord(row?.encryptedCredentials).accessToken);
    if (!row?.isActive || !token) throw new BadRequestException('Reconnect Mes Colis to continue.');
    return token;
  }

  private async testToken(token: string) {
    try {
      const response = await fetch(`${MES_COLIS_API()}/orders/GetOrder`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-access-token': token },
        body: JSON.stringify({ barcode: 'SHOPY-CONNECTION-TEST' }),
        signal: AbortSignal.timeout(12_000),
      });
      const body = await safeJson(response);
      const code = providerCode(body);
      if (response.ok || code.includes('ORDER_NOT_FOUND') || code.includes('ORDERS_NOTFOUND')) {
        return { ok: true, message: 'Mes Colis credentials are valid.' };
      }
      if (
        code.includes('INVALID_TOKEN') ||
        code.includes('NO_TOKEN') ||
        code.includes('USER_NOT_FOUND')
      ) {
        return {
          ok: false,
          message: 'Mes Colis rejected this access token. Reconnect with a valid token.',
        };
      }
      if (code.includes('ACCESS_DENIED')) {
        return {
          ok: false,
          message: 'This Mes Colis account cannot read parcel tracking. Check account access.',
        };
      }
      return {
        ok: false,
        message:
          'Mes Colis could not verify this connection. Try again when the provider is available.',
      };
    } catch (error) {
      return {
        ok: false,
        message:
          error instanceof Error && error.name === 'TimeoutError'
            ? 'Mes Colis did not respond in time. Try the connection test again.'
            : 'Mes Colis is currently unreachable. Your other Shopy workflows are unaffected.',
      };
    }
  }

  private async getOrder(token: string, barcode: string) {
    try {
      const response = await fetch(`${MES_COLIS_API()}/orders/GetOrder`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-access-token': token },
        body: JSON.stringify({ barcode }),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await safeJson(response);
      const code = providerCode(body);
      if (!response.ok) {
        if (code.includes('ORDER_NOT_FOUND') || code.includes('ORDERS_NOTFOUND'))
          throw new NotFoundException('Mes Colis could not find this barcode.');
        if (
          code.includes('INVALID_TOKEN') ||
          code.includes('NO_TOKEN') ||
          code.includes('USER_NOT_FOUND')
        )
          throw new BadRequestException('Mes Colis access expired. Reconnect in Settings.');
        if (code.includes('ACCESS_DENIED'))
          throw new BadRequestException('This Mes Colis account cannot read that parcel.');
        throw new ServiceUnavailableException(
          'Mes Colis tracking is temporarily unavailable. Existing tracking remains visible.',
        );
      }
      if (!body.barcode || !body.status) {
        throw new ServiceUnavailableException(
          'Mes Colis returned an incomplete tracking response. Try again later.',
        );
      }
      return body;
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException ||
        error instanceof ServiceUnavailableException
      )
        throw error;
      throw new ServiceUnavailableException(
        error instanceof Error && error.name === 'TimeoutError'
          ? 'Mes Colis tracking timed out. Try again shortly.'
          : 'Mes Colis is currently unreachable. Existing tracking remains visible.',
      );
    }
  }

  private async mergedConfig(organizationId: string, patch: Record<string, unknown>) {
    const row = await this.prisma.integration.findUnique({
      where: {
        organizationId_provider: { organizationId, provider: IntegrationProvider.MES_COLIS },
      },
      select: { config: true },
    });
    return { ...asRecord(row?.config), ...patch } as Prisma.InputJsonValue;
  }
}

export function normalizeMesColisStatus(value: string) {
  return STATUS_MAP[value] ?? 'NEEDS_REVIEW';
}

function normalizeRawStatus(value: unknown) {
  const status = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!status) throw new BadRequestException('Mes Colis response did not include a status.');
  return status;
}

function cleanBarcode(value: unknown) {
  const barcode = String(value ?? '').trim();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(barcode))
    throw new BadRequestException('Enter a valid Mes Colis barcode.');
  return barcode;
}

function safeDetails(payload: Record<string, unknown>) {
  const allowed = [
    'qualification',
    'motif',
    'updated_at',
    'delivered_at',
    'receiver_name',
    'deliveryman_name',
    'deliveryman_phone_number',
    'destination_agency_name',
    'destination_agency_code',
  ];
  return Object.fromEntries(
    allowed.filter((key) => payload[key] != null).map((key) => [key, payload[key]]),
  );
}

function safeParcel<
  T extends {
    id: string;
    barcode: string;
    orderId: string | null;
    providerStatus: string;
    normalizedStatus: string;
    matchState: ParcelMatchState;
    matchConfidence: number;
    matchReasons: unknown;
    details: unknown;
    lastProviderUpdateAt: Date | null;
    lastSyncedAt: Date | null;
  },
>(row: T) {
  return {
    id: row.id,
    barcode: row.barcode,
    orderId: row.orderId,
    providerStatus: row.providerStatus,
    normalizedStatus: row.normalizedStatus,
    matchState: row.matchState,
    matchConfidence: row.matchConfidence,
    matchReasons: row.matchReasons,
    details: row.details,
    lastProviderUpdateAt: row.lastProviderUpdateAt,
    lastSyncedAt: row.lastSyncedAt,
  };
}

function safeTotals(value: unknown) {
  const row = asRecord(value);
  return Object.fromEntries(
    ['linked', 'matched', 'updated', 'unchanged', 'unmatched', 'conflicts', 'failed'].map((key) => [
      key,
      Number(row[key] ?? 0),
    ]),
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDate(value: unknown) {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function asDate(value: unknown) {
  return parseDate(value)?.toISOString() ?? null;
}

async function safeJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    return asRecord(value);
  } catch {
    return {};
  }
}

function providerCode(body: Record<string, unknown>) {
  return [body.code, body.error, body.message, body.status]
    .filter((value) => value != null)
    .map(String)
    .join(' ')
    .toUpperCase();
}
