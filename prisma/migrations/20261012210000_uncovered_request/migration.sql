-- CreateTable
CREATE TABLE "UncoveredRequest" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "request" TEXT NOT NULL,
    "closestAlternative" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UncoveredRequest_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "UncoveredRequest" ADD CONSTRAINT "UncoveredRequest_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

