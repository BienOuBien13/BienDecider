-- Limite des tentatives de connexion et d'inscription par adresse IP (hachée).
CREATE TABLE "AuthThrottle" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AuthThrottle_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "AuthThrottle_windowStart_idx" ON "AuthThrottle"("windowStart");
