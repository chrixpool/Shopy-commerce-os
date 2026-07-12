ALTER TYPE "IntegrationProvider" ADD VALUE IF NOT EXISTS 'MES_COLIS';

CREATE TYPE "IntegrationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'SKIPPED');
CREATE TYPE "ParcelMatchState" AS ENUM ('EXACT_BARCODE', 'EXACT_ORDER_REFERENCE', 'HIGH_CONFIDENCE_FALLBACK', 'MANUAL', 'UNMATCHED', 'CONFLICT');

CREATE TABLE "IntegrationSyncRun" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "IntegrationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "initiatedBy" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "heartbeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "summary" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "IntegrationSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "IntegrationSyncProviderRun" (
    "id" TEXT NOT NULL,
    "parentRunId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationRunStatus" NOT NULL DEFAULT 'QUEUED',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "totals" JSONB NOT NULL DEFAULT '{}',
    "warnings" JSONB NOT NULL DEFAULT '[]',
    "errorCode" TEXT,
    CONSTRAINT "IntegrationSyncProviderRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderParcel" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "barcode" TEXT NOT NULL,
    "orderId" TEXT,
    "providerStatus" TEXT NOT NULL,
    "normalizedStatus" TEXT NOT NULL,
    "matchState" "ParcelMatchState" NOT NULL DEFAULT 'UNMATCHED',
    "matchConfidence" INTEGER NOT NULL DEFAULT 0,
    "matchReasons" JSONB NOT NULL DEFAULT '[]',
    "details" JSONB NOT NULL DEFAULT '{}',
    "lastProviderUpdateAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProviderParcel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProviderParcelEvent" (
    "id" TEXT NOT NULL,
    "providerParcelId" TEXT NOT NULL,
    "providerStatus" TEXT NOT NULL,
    "normalizedStatus" TEXT NOT NULL,
    "eventHash" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProviderParcelEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IntegrationSyncRun_organizationId_startedAt_idx" ON "IntegrationSyncRun"("organizationId", "startedAt" DESC);
CREATE INDEX "IntegrationSyncRun_organizationId_status_idx" ON "IntegrationSyncRun"("organizationId", "status");
CREATE UNIQUE INDEX "IntegrationSyncProviderRun_parentRunId_provider_key" ON "IntegrationSyncProviderRun"("parentRunId", "provider");
CREATE INDEX "IntegrationSyncProviderRun_provider_status_idx" ON "IntegrationSyncProviderRun"("provider", "status");
CREATE UNIQUE INDEX "ProviderParcel_organizationId_provider_barcode_key" ON "ProviderParcel"("organizationId", "provider", "barcode");
CREATE INDEX "ProviderParcel_organizationId_matchState_idx" ON "ProviderParcel"("organizationId", "matchState");
CREATE INDEX "ProviderParcel_organizationId_normalizedStatus_idx" ON "ProviderParcel"("organizationId", "normalizedStatus");
CREATE INDEX "ProviderParcel_orderId_idx" ON "ProviderParcel"("orderId");
CREATE UNIQUE INDEX "ProviderParcelEvent_providerParcelId_eventHash_key" ON "ProviderParcelEvent"("providerParcelId", "eventHash");
CREATE INDEX "ProviderParcelEvent_providerParcelId_occurredAt_idx" ON "ProviderParcelEvent"("providerParcelId", "occurredAt");

ALTER TABLE "IntegrationSyncRun" ADD CONSTRAINT "IntegrationSyncRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationSyncProviderRun" ADD CONSTRAINT "IntegrationSyncProviderRun_parentRunId_fkey" FOREIGN KEY ("parentRunId") REFERENCES "IntegrationSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderParcel" ADD CONSTRAINT "ProviderParcel_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProviderParcel" ADD CONSTRAINT "ProviderParcel_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProviderParcelEvent" ADD CONSTRAINT "ProviderParcelEvent_providerParcelId_fkey" FOREIGN KEY ("providerParcelId") REFERENCES "ProviderParcel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
