CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planItemId" TEXT,
    "agent" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "activeDedupeKey" TEXT,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxDurationSeconds" INTEGER NOT NULL DEFAULT 60,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Company"
    ADD COLUMN "dailyAgentRunLimit" INTEGER NOT NULL DEFAULT 10,
    ADD COLUMN "monthlyAgentRunLimit" INTEGER NOT NULL DEFAULT 100,
    ADD COLUMN "dailySpendLimitUsd" DOUBLE PRECISION NOT NULL DEFAULT 5,
    ADD COLUMN "monthlySpendLimitUsd" DOUBLE PRECISION NOT NULL DEFAULT 25,
    ADD COLUMN "quotaEpoch" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "AgentRun"
    ADD COLUMN "reservedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 1;

CREATE TABLE "AgentRunAttempt" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agentRunId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    CONSTRAINT "AgentRunAttempt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AgentRunAttempt_companyId_queuedAt_idx" ON "AgentRunAttempt"("companyId", "queuedAt");
CREATE INDEX "AgentRunAttempt_agentRunId_queuedAt_idx" ON "AgentRunAttempt"("agentRunId", "queuedAt");
ALTER TABLE "AgentRunAttempt" ADD CONSTRAINT "AgentRunAttempt_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRunAttempt" ADD CONSTRAINT "AgentRunAttempt_agentRunId_fkey"
    FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UsageEvent" ADD COLUMN "agentRunId" TEXT;
ALTER TABLE "AgentProposal" ADD COLUMN "agentRunId" TEXT;
ALTER TABLE "AuditFinding" ADD COLUMN "agentRunId" TEXT;
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_agentRunId_fkey"
    FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_agentRunId_fkey"
    FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_agentRunId_fkey"
    FOREIGN KEY ("agentRunId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "UsageReservation" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "amountUsd" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "releasedAt" TIMESTAMP(3),
    CONSTRAINT "UsageReservation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UsageReservation_companyId_expiresAt_idx" ON "UsageReservation"("companyId", "expiresAt");
ALTER TABLE "UsageReservation" ADD CONSTRAINT "UsageReservation_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UsageEvent" ADD COLUMN "reservationId" TEXT;
CREATE UNIQUE INDEX "UsageEvent_reservationId_key" ON "UsageEvent"("reservationId");
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_reservationId_fkey"
    FOREIGN KEY ("reservationId") REFERENCES "UsageReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "AgentRun_companyId_requestKey_key" ON "AgentRun"("companyId", "requestKey");
CREATE UNIQUE INDEX "AgentRun_companyId_activeDedupeKey_key" ON "AgentRun"("companyId", "activeDedupeKey");
CREATE INDEX "AgentRun_companyId_status_createdAt_idx" ON "AgentRun"("companyId", "status", "createdAt");
CREATE INDEX "AgentRun_status_queuedAt_idx" ON "AgentRun"("status", "queuedAt");

ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_planItemId_fkey"
    FOREIGN KEY ("planItemId") REFERENCES "ActionPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;