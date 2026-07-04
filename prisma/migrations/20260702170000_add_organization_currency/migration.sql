ALTER TABLE "Organization" ADD COLUMN "baseCurrency" TEXT NOT NULL DEFAULT 'USD';

CREATE INDEX "Invitation_organizationId_status_idx" ON "Invitation"("organizationId", "status");
CREATE INDEX "Parcel_status_idx" ON "Parcel"("status");
