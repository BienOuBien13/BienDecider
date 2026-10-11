-- CreateTable
CREATE TABLE "DelegationRiskSetting" (
    "id" TEXT NOT NULL,
    "actionKind" TEXT NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DelegationRiskSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DelegationRiskSetting_actionKind_key" ON "DelegationRiskSetting"("actionKind");