import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { MetaAdsAdapter } = require('../apps/api/dist/modules/integrations/adapters/meta-ads.adapter.js');
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

  console.log('Meta Ads read-only smoke passed: valid, sync, expired, permission, accounts.');
}

run()
  .finally(() => {
    globalThis.fetch = originalFetch;
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Meta Ads smoke failed');
    process.exitCode = 1;
  });
