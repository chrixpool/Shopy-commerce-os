import type { IntegrationProvider, Prisma } from '@prisma/client';
import type { IntegrationCapabilities } from '@shopy/shared';

export interface AdapterConnection {
  organizationId: string;
  config: Record<string, unknown>;
  credentials?: Record<string, unknown>;
}

export interface SyncResult {
  provider: IntegrationProvider;
  dryRun: boolean;
  summary: string;
  counts: Record<string, number>;
  warnings?: string[];
  records?: Prisma.InputJsonValue;
}

export interface DraftActionInput {
  organizationId: string;
  actionType: string;
  title?: string;
  summary?: string;
  payload?: Prisma.InputJsonValue;
}

export interface IntegrationAdapter {
  provider: IntegrationProvider;
  capabilities(): IntegrationCapabilities;
  getConnectionStatus(connection?: AdapterConnection | null): Promise<string>;
  testConnection(connection?: AdapterConnection | null): Promise<{ ok: boolean; message: string }>;
  sync(connection: AdapterConnection, dryRun: boolean): Promise<SyncResult>;
  handleWebhook?(
    organizationId: string,
    headers: Record<string, string | undefined>,
    payload: unknown,
  ): Promise<SyncResult>;
  createDraftAction(
    input: DraftActionInput,
  ): Promise<{ title: string; summary: string; payload: Prisma.InputJsonValue }>;
  dryRunAction(input: DraftActionInput): Promise<{ ok: boolean; message: string }>;
  executeApprovedAction(input: DraftActionInput): Promise<{ ok: boolean; message: string }>;
}
