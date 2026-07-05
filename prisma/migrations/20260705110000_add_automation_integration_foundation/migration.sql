CREATE TYPE "IntegrationProvider" AS ENUM ('SHOPIFY', 'META_ADS', 'FACEBOOK_PAGE', 'INSTAGRAM', 'CSV', 'MANUAL');
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'CONNECTING', 'CONNECTED', 'ERROR', 'DISABLED');
CREATE TYPE "IntegrationMode" AS ENUM ('READ_ONLY', 'DRAFT_ACTIONS', 'APPROVAL_REQUIRED', 'FULL_WRITE');
CREATE TYPE "AutomationRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED');
CREATE TYPE "ExternalEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED');
CREATE TYPE "DraftActionStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

ALTER TABLE "Integration"
  ADD COLUMN "encryptedCredentials" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
  ADD COLUMN "mode" "IntegrationMode" NOT NULL DEFAULT 'READ_ONLY',
  ADD COLUMN "errorMessage" TEXT;

ALTER TABLE "Automation"
  ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "provider" "IntegrationProvider",
  ADD COLUMN "triggerType" TEXT,
  ADD COLUMN "actionType" TEXT,
  ADD COLUMN "dryRun" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "approvalRequired" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "conditions" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "actionConfig" JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN "lastStatus" TEXT,
  ADD COLUMN "errorMessage" TEXT;

CREATE TABLE "AutomationRun" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "automationId" TEXT,
  "status" "AutomationRunStatus" NOT NULL DEFAULT 'QUEUED',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "inputSnapshot" JSONB NOT NULL DEFAULT '{}',
  "outputSnapshot" JSONB NOT NULL DEFAULT '{}',
  "errorMessage" TEXT,
  "dryRun" BOOLEAN NOT NULL DEFAULT true,
  "approvedBy" TEXT,
  CONSTRAINT "AutomationRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ExternalEvent" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "eventType" TEXT NOT NULL,
  "externalId" TEXT,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "payloadHash" TEXT NOT NULL,
  "processedAt" TIMESTAMP(3),
  "status" "ExternalEventStatus" NOT NULL DEFAULT 'RECEIVED',
  "errorMessage" TEXT,
  CONSTRAINT "ExternalEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DraftAction" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "actionType" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "summary" TEXT NOT NULL,
  "payload" JSONB NOT NULL DEFAULT '{}',
  "status" "DraftActionStatus" NOT NULL DEFAULT 'DRAFT',
  "createdBy" TEXT,
  "approvedBy" TEXT,
  "executedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DraftAction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Integration_organizationId_status_idx" ON "Integration"("organizationId", "status");
CREATE INDEX "Automation_organizationId_enabled_idx" ON "Automation"("organizationId", "enabled");
CREATE INDEX "AutomationRun_organizationId_startedAt_idx" ON "AutomationRun"("organizationId", "startedAt");
CREATE INDEX "AutomationRun_automationId_idx" ON "AutomationRun"("automationId");
CREATE UNIQUE INDEX "ExternalEvent_organizationId_provider_eventType_payloadHash_key" ON "ExternalEvent"("organizationId", "provider", "eventType", "payloadHash");
CREATE INDEX "ExternalEvent_organizationId_provider_receivedAt_idx" ON "ExternalEvent"("organizationId", "provider", "receivedAt");
CREATE INDEX "ExternalEvent_status_idx" ON "ExternalEvent"("status");
CREATE INDEX "DraftAction_organizationId_status_idx" ON "DraftAction"("organizationId", "status");
CREATE INDEX "DraftAction_organizationId_provider_idx" ON "DraftAction"("organizationId", "provider");

ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AutomationRun" ADD CONSTRAINT "AutomationRun_automationId_fkey" FOREIGN KEY ("automationId") REFERENCES "Automation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExternalEvent" ADD CONSTRAINT "ExternalEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DraftAction" ADD CONSTRAINT "DraftAction_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
