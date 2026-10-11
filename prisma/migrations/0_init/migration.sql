-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "ownerEmail" TEXT NOT NULL,
    "passwordHash" TEXT,
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "name" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "servingArea" TEXT NOT NULL,
    "website" TEXT,
    "socialHandles" TEXT,
    "objective" TEXT,
    "monthlyRevenue" INTEGER,
    "revenueTarget" INTEGER,
    "targetDate" TIMESTAMP(3),
    "averageClientValue" INTEGER,
    "newClientsPerMonth" INTEGER,
    "description" TEXT,
    "phone" TEXT,
    "certifications" TEXT,
    "openingHours" TEXT,
    "direction" TEXT,
    "autoOutreachEnabled" BOOLEAN NOT NULL DEFAULT false,
    "siteSlug" TEXT,
    "siteHtml" TEXT,
    "sitePublishedAt" TIMESTAMP(3),
    "loginCount" INTEGER NOT NULL DEFAULT 0,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "proposalId" TEXT,
    "name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "publicContact" TEXT,
    "source" TEXT,
    "segment" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'propose',
    "contactedAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "meetingAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "costUsd" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActionPlanItem" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "timing" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'propose',
    "feedback" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActionPlanItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "whatWorks" TEXT,
    "toImprove" TEXT,
    "actionItems" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelConnection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'non_connecte',
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentProposal" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "agent" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'en_attente',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "planItemId" TEXT,

    CONSTRAINT "AgentProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExecutionLog" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "executedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT NOT NULL,
    "detail" TEXT,

    CONSTRAINT "ExecutionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_ownerEmail_key" ON "Company"("ownerEmail");

-- CreateIndex
CREATE UNIQUE INDEX "Company_siteSlug_key" ON "Company"("siteSlug");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_proposalId_key" ON "Lead"("proposalId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelConnection_companyId_channel_key" ON "ChannelConnection"("companyId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "ExecutionLog_proposalId_key" ON "ExecutionLog"("proposalId");

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AgentProposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActionPlanItem" ADD CONSTRAINT "ActionPlanItem_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelConnection" ADD CONSTRAINT "ChannelConnection_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentProposal" ADD CONSTRAINT "AgentProposal_planItemId_fkey" FOREIGN KEY ("planItemId") REFERENCES "ActionPlanItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExecutionLog" ADD CONSTRAINT "ExecutionLog_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "AgentProposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

