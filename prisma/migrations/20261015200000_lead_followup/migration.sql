-- Raison d'un prospect écarté ou différé par le dirigeant, et date de reprise d'un prospect différé.
ALTER TABLE "Lead" ADD COLUMN "statusReason" TEXT,
ADD COLUMN "deferredUntil" TIMESTAMP(3);
