-- CreateTable
CREATE TABLE "LoginHandoff" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginHandoff_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LoginHandoff_tokenHash_key" ON "LoginHandoff"("tokenHash");

-- CreateIndex
CREATE INDEX "LoginHandoff_userId_createdAt_idx" ON "LoginHandoff"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "LoginHandoff" ADD CONSTRAINT "LoginHandoff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
