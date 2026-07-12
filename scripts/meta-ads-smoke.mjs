import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MetaAdsAdapter } = require('../apps/api/dist/modules/integrations/adapters/meta-ads.adapter.js');
const { IntegrationsService } = require('../apps/api/dist/modules/integrations/integrations.service.js');
const { IntegrationSecretsService } = require('../apps/api/dist/modules/integrations/crypto/integration-secrets.service.js');
const adapter = new MetaAdsAdapter();
const originalFetch = globalThis.fetch;

function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function run() {
  const connection = {
    organizationId: 'org_test',
    config: { accountId: 'act_123' },
    credentials: { accessToken: 'test-token' },
  };

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes('/me/permissions')) {
      return response({ data: [{ permission: 'ads_read', status: 'granted' }] });
    }
    if (url.includes('/me/adaccounts')) {
      return response({ data: [{ id: 'act_123', name: 'Test account', currency: 'USD' }] });
    }
    if (url.includes('/campaigns')) {
      return response({ data: [{ id: 'cmp_1', name: 'Read only', status: 'ACTIVE' }] });
    }
    return response({
      data: [{ campaign_id: 'cmp_1', spend: '10', impressions: '1000', clicks: '20', ctr: '2', cpc: '0.5', cpm: '10', date_stop: '2026-07-12' }],
    });
  };

  const valid = await adapter.testConnection(connection);
  assert.equal(valid.ok, true);
  assert.equal(valid.selectedAccount?.id, 'act_123');
  const sync = await adapter.sync(connection, true);
  assert.equal(sync.counts.found, 1);
  assert.equal(sync.dryRun, true);

  globalThis.fetch = async () => response({ error: { code: 190, error_subcode: 463 } }, 401);
  assert.equal((await adapter.testConnection(connection)).code, 'EXPIRED_TOKEN');

  globalThis.fetch = async (input) =>
    String(input).includes('/permissions')
      ? response({ data: [{ permission: 'public_profile', status: 'granted' }] })
      : response({ data: [{ id: 'act_123', name: 'Test account' }] });
  assert.equal((await adapter.testConnection(connection)).code, 'MISSING_PERMISSION');

  globalThis.fetch = async (input) =>
    String(input).includes('/permissions')
      ? response({ data: [{ permission: 'ads_read', status: 'granted' }] })
      : response({ data: [] });
  assert.equal((await adapter.testConnection(connection)).code, 'NO_AD_ACCOUNTS');

  const previousKey = process.env.INTEGRATION_SECRET_KEY;
  process.env.INTEGRATION_SECRET_KEY = 'test-only-integration-key';
  const secrets = new IntegrationSecretsService();
  const encrypted = secrets.encrypt('private-token');
  const replacement = secrets.encrypt('replacement-token');
  assert.equal(JSON.stringify(encrypted).includes('private-token'), false);
  assert.equal(secrets.decrypt(encrypted), 'private-token');
  assert.notDeepEqual(encrypted, replacement);
  assert.equal(adapter.capabilities().canLaunchAds, false);

  const runs = new Map();
  let sequence = 0;
  let disconnectUpdate;
  const prisma = {
    integration: {
      findMany: async () => [
        { provider: 'SHOPIFY', status: 'CONNECTED', isActive: true },
        { provider: 'META_ADS', status: 'CONNECTED', isActive: true },
      ],
      upsert: async ({ update }) => {
        disconnectUpdate = update;
        return { provider: 'SHOPIFY', status: 'DISCONNECTED', isActive: false };
      },
    },
    automationRun: {
      findFirst: async ({ where }) =>
        [...runs.values()].find(
          (run) =>
            run.organizationId === where.organizationId &&
            (!where.id || run.id === where.id) &&
            (!where.status || ['QUEUED', 'RUNNING'].includes(run.status)),
        ) ?? null,
      findMany: async ({ where }) =>
        [...runs.values()].filter((run) => run.organizationId === where.organizationId),
      create: async ({ data }) => {
        const run = {
          id: `run_${++sequence}`,
          startedAt: new Date(),
          finishedAt: null,
          ...data,
        };
        runs.set(run.id, run);
        return run;
      },
      update: async ({ where, data }) => {
        const run = { ...runs.get(where.id), ...data };
        runs.set(where.id, run);
        return run;
      },
    },
  };
  const service = new IntegrationsService(prisma, secrets);
  service.test = async () => ({ ok: true, message: 'valid' });
  service.sync = async (_organizationId, provider) =>
    provider === 'META_ADS'
      ? { ok: false, counts: {}, warnings: ['sanitized'] }
      : { ok: true, counts: { found: 2, created: 1 }, warnings: [] };
  const first = await service.startSyncAll('org_one', 'user_one');
  const duplicate = await service.startSyncAll('org_one', 'user_one');
  assert.equal(duplicate.id, first.id);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const completed = await service.syncAllRun('org_one', first.id);
  assert.equal(completed.status, 'partial');
  assert.equal(completed.providers.find((item) => item.provider === 'SHOPIFY').status, 'success');
  assert.equal(completed.providers.find((item) => item.provider === 'META_ADS').status, 'failed');
  await assert.rejects(() => service.syncAllRun('org_other', first.id));
  await service.disconnect('org_one', 'SHOPIFY');
  assert.deepEqual(disconnectUpdate.encryptedCredentials, {});
  assert.deepEqual(disconnectUpdate.credentials, {});

  if (previousKey === undefined) delete process.env.INTEGRATION_SECRET_KEY;
  else process.env.INTEGRATION_SECRET_KEY = previousKey;

  console.log('Integration smoke passed: Meta diagnostics, encryption, sync-all isolation and partial success.');
}

run()
  .finally(() => {
    globalThis.fetch = originalFetch;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Meta Ads smoke failed');
    process.exitCode = 1;
  });
