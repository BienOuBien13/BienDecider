-- US #171 : brouillon distinct de l'approbation et version exacte approuvée.
-- Les approbations existantes gardent approvedVersion à NULL : elles devront être reconfirmées avant exécution.
ALTER TABLE "AgentProposal" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "AgentProposal" ADD COLUMN "approvedVersion" INTEGER;
ALTER TABLE "AgentProposal" ADD COLUMN "approvedAt" TIMESTAMP(3);
ALTER TABLE "AgentProposal" ADD COLUMN "draftSavedAt" TIMESTAMP(3);
