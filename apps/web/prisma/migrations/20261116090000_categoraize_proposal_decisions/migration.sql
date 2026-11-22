-- CreateTable
CREATE TABLE "CategorizeProposalDecision" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "key" TEXT NOT NULL,
    "accepted" BOOLEAN NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "CategorizeProposalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategorizeProposalDecision_emailAccountId_key_key" ON "CategorizeProposalDecision"("emailAccountId", "key");

-- AddForeignKey
ALTER TABLE "CategorizeProposalDecision" ADD CONSTRAINT "CategorizeProposalDecision_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
