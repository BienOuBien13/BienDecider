CREATE TABLE "LinkedInAuthorization" (
    "stateHash" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "sessionHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "redirectUri" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "LinkedInAuthorization_pkey" PRIMARY KEY ("stateHash")
);

CREATE INDEX "LinkedInAuthorization_expiresAt_idx" ON "LinkedInAuthorization"("expiresAt");

ALTER TABLE "LinkedInAuthorization" ADD CONSTRAINT "LinkedInAuthorization_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;