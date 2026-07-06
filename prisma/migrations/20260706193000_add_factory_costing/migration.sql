-- CreateTable
CREATE TABLE "Factory" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Factory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostComponent" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "defaultUnitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CostComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCost" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "factoryId" TEXT,
    "sewingCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "fabricCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "accessoryCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "packagingCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "otherVariableCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "overheadAllocation" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalUnitCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "notes" TEXT,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperatingExpense" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "recurrence" TEXT NOT NULL DEFAULT 'ONE_TIME',
    "appliesToProductId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperatingExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderCostSnapshot" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productCostTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "packagingCostTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "shippingSupplyCostTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "otherCostTotal" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "grossMargin" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "grossMarginPercent" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderCostSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Factory_organizationId_active_idx" ON "Factory"("organizationId", "active");
CREATE INDEX "CostComponent_organizationId_active_idx" ON "CostComponent"("organizationId", "active");
CREATE INDEX "ProductCost_organizationId_active_idx" ON "ProductCost"("organizationId", "active");
CREATE INDEX "ProductCost_productId_idx" ON "ProductCost"("productId");
CREATE INDEX "OperatingExpense_organizationId_active_idx" ON "OperatingExpense"("organizationId", "active");
CREATE UNIQUE INDEX "OrderCostSnapshot_orderId_key" ON "OrderCostSnapshot"("orderId");
CREATE INDEX "OrderCostSnapshot_organizationId_calculatedAt_idx" ON "OrderCostSnapshot"("organizationId", "calculatedAt");

-- AddForeignKey
ALTER TABLE "Factory" ADD CONSTRAINT "Factory_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CostComponent" ADD CONSTRAINT "CostComponent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCost" ADD CONSTRAINT "ProductCost_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCost" ADD CONSTRAINT "ProductCost_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductCost" ADD CONSTRAINT "ProductCost_factoryId_fkey" FOREIGN KEY ("factoryId") REFERENCES "Factory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperatingExpense" ADD CONSTRAINT "OperatingExpense_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperatingExpense" ADD CONSTRAINT "OperatingExpense_appliesToProductId_fkey" FOREIGN KEY ("appliesToProductId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrderCostSnapshot" ADD CONSTRAINT "OrderCostSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderCostSnapshot" ADD CONSTRAINT "OrderCostSnapshot_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
