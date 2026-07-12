import { IntegrationProvider, Prisma } from '@prisma/client';
import { READ_ONLY_CAPABILITIES, type IntegrationCapabilities } from '@shopy/shared';
import type {
  AdapterConnection,
  DraftActionInput,
  IntegrationAdapter,
  SyncResult,
} from './integration-adapter.interface';

export class MesColisAdapter implements IntegrationAdapter {
  provider = IntegrationProvider.MES_COLIS;
  capabilities(): IntegrationCapabilities {
    return { ...READ_ONLY_CAPABILITIES, canReceiveWebhooks: false };
  }
  async getConnectionStatus(connection?: AdapterConnection | null) {
    return connection?.credentials?.accessToken ? 'configured' : 'disconnected';
  }
  async testConnection() {
    return { ok: false, message: 'Use the Mes Colis read-only connection test.' };
  }
  async sync(_connection: AdapterConnection, dryRun: boolean): Promise<SyncResult> {
    return {
      provider: this.provider,
      dryRun,
      summary: 'Use the linked-barcode sync.',
      counts: {},
      warnings: [],
    };
  }
  async createDraftAction(input: DraftActionInput) {
    return {
      title: input.title ?? 'Mes Colis review',
      summary: input.summary ?? 'Read-only review',
      payload: input.payload ?? ({} as Prisma.InputJsonValue),
    };
  }
  async dryRunAction() {
    return { ok: true, message: 'Read-only. No Mes Colis write exists.' };
  }
  async executeApprovedAction() {
    return { ok: false, message: 'Mes Colis writes are disabled.' };
  }
}
