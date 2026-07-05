import { IntegrationProvider, Prisma } from '@prisma/client';
import { READ_ONLY_CAPABILITIES, type IntegrationCapabilities } from '@shopy/shared';
import type {
  AdapterConnection,
  DraftActionInput,
  IntegrationAdapter,
  SyncResult,
} from './integration-adapter.interface';

export abstract class MockAdapter implements IntegrationAdapter {
  abstract provider: IntegrationProvider;
  abstract label: string;

  capabilities(): IntegrationCapabilities {
    return READ_ONLY_CAPABILITIES;
  }

  async getConnectionStatus(connection?: AdapterConnection | null) {
    return connection?.config ? 'configured' : 'disconnected';
  }

  async testConnection(connection?: AdapterConnection | null) {
    return {
      ok: Boolean(connection?.config),
      message: connection?.config
        ? `${this.label} metadata is configured. Live API checks are optional.`
        : `${this.label} is not connected.`,
    };
  }

  async sync(connection: AdapterConnection, dryRun: boolean): Promise<SyncResult> {
    return {
      provider: this.provider,
      dryRun,
      summary: `${this.label} sync ${dryRun ? 'dry run' : 'run'} completed using safe mock mode.`,
      counts: { imported: 0, updated: 0, skipped: 0 },
      warnings: ['No external API call was made. Add valid tokens to enable live read-only sync.'],
      records: { config: connection.config } as Prisma.InputJsonValue,
    };
  }

  async createDraftAction(input: DraftActionInput) {
    return {
      title: input.title ?? `${this.label} draft action`,
      summary: input.summary ?? 'Draft created for review. No external write was executed.',
      payload: input.payload ?? {},
    };
  }

  async dryRunAction() {
    return { ok: true, message: 'Dry run only. No external write was executed.' };
  }

  async executeApprovedAction() {
    return { ok: false, message: 'External write execution is disabled in this phase.' };
  }
}

export class CsvAdapter extends MockAdapter {
  provider = IntegrationProvider.CSV;
  label = 'CSV import';
}

export class ManualAdapter extends MockAdapter {
  provider = IntegrationProvider.MANUAL;
  label = 'Manual workflows';
}
