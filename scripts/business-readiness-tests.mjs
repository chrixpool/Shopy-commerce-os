import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  Role,
  OrderStatus,
  ConfirmationStatus,
  FulfillmentStatus,
} = require('../packages/shared/dist/index.js');
const { InternalAuthGuard } = require('../apps/api/dist/core/auth/internal-auth.guard.js');
const {
  assertOrderTransition,
  assertFulfillmentTransition,
} = require('../apps/api/dist/modules/workflows/workflow-transitions.js');
const { reconciliationResult } = require('../apps/api/dist/modules/workflows/workflows.service.js');
const {
  MES_COLIS_STATUSES,
  normalizeMesColisStatus,
} = require('../apps/api/dist/modules/integrations/mes-colis.service.js');
const {
  IntegrationSecretsService,
} = require('../apps/api/dist/modules/integrations/crypto/integration-secrets.service.js');

function context(role) {
  const request = {
    headers: {
      'x-internal-secret': 'test-internal',
      'x-user-id': 'user-1',
      'x-user-email': 'masked@example.invalid',
      'x-user-role': role,
      'x-organization-id': 'org-1',
    },
  };
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => request }),
  };
}

process.env.API_INTERNAL_SECRET = 'test-internal';
const adminReflector = { getAllAndOverride: () => Role.ADMIN };
assert.equal(new InternalAuthGuard(adminReflector).canActivate(context(Role.OWNER)), true);
assert.equal(new InternalAuthGuard(adminReflector).canActivate(context(Role.ADMIN)), true);
assert.throws(() => new InternalAuthGuard(adminReflector).canActivate(context(Role.CONFIRMER)));
assert.throws(() => new InternalAuthGuard(adminReflector).canActivate(context(Role.VIEWER)));
delete process.env.API_INTERNAL_SECRET;
assert.throws(() => new InternalAuthGuard(adminReflector).canActivate(context(Role.OWNER)));

assert.doesNotThrow(() => assertOrderTransition(OrderStatus.PENDING, OrderStatus.CONFIRMED));
assert.throws(() => assertOrderTransition(OrderStatus.PENDING, OrderStatus.DELIVERED));
assert.doesNotThrow(() =>
  assertFulfillmentTransition(FulfillmentStatus.TO_PACK, FulfillmentStatus.PACKED),
);
assert.throws(() =>
  assertFulfillmentTransition(FulfillmentStatus.PACKED, FulfillmentStatus.TO_PACK),
);

const preview = reconciliationResult([
  { status: OrderStatus.CONFIRMED, confirmationTask: null, fulfillmentTask: null },
  {
    status: OrderStatus.CONFIRMED,
    confirmationTask: { id: 'c', status: ConfirmationStatus.CONFIRMED },
    fulfillmentTask: { id: 'f', status: FulfillmentStatus.TO_PACK },
  },
]);
assert.equal(preview.missingConfirmationTasks, 1);
assert.equal(preview.missingFulfillmentTasks, 1);

for (const status of MES_COLIS_STATUSES) {
  assert.notEqual(normalizeMesColisStatus(status), 'NEEDS_REVIEW');
}
assert.equal(normalizeMesColisStatus('future-provider-status'), 'NEEDS_REVIEW');

process.env.INTEGRATION_SECRET_KEY = 'test-only-integration-key';
const secrets = new IntegrationSecretsService();
const encrypted = secrets.encrypt('sensitive-test-value');
assert.notEqual(encrypted.value, 'sensitive-test-value');
assert.equal(secrets.decrypt(encrypted), 'sensitive-test-value');

const mesColisSource = fs.readFileSync(
  new URL('../apps/api/src/modules/integrations/mes-colis.service.ts', import.meta.url),
  'utf8',
);
for (const forbidden of ['/orders/Create', '/orders/DeleteOrder', '/sub_accounts']) {
  assert.equal(
    mesColisSource.includes(forbidden),
    false,
    `Forbidden Mes Colis write path: ${forbidden}`,
  );
}

const mainSource = fs.readFileSync(new URL('../apps/api/src/main.ts', import.meta.url), 'utf8');
assert.equal(mainSource.includes('API_INTERNAL_SECRET is required in production'), true);

console.log(
  'Business readiness tests passed: RBAC, secret gate, transitions, reconciliation, encryption, Mes Colis status coverage and no-write guarantee.',
);
