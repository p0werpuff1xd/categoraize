-- AlterTable
ALTER TABLE "CategorizePriorityOverrideLog" ADD COLUMN "isAccurate" BOOLEAN,
ADD COLUMN "categoryId" TEXT;

-- CreateTable
CREATE TABLE "CategorizeUserConsent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "termsVersion" TEXT NOT NULL,
    "privacyVersion" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "externalLlmEnabled" BOOLEAN NOT NULL DEFAULT false,
    "withdrawnAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "CategorizeUserConsent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategorizePriorityOverrideLog_emailAccountId_categoryId_cre_idx" ON "CategorizePriorityOverrideLog"("emailAccountId", "categoryId", "createdAt");

-- CreateIndex
CREATE INDEX "CategorizeUserConsent_userId_createdAt_idx" ON "CategorizeUserConsent"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "CategorizePriorityOverrideLog" ADD CONSTRAINT "CategorizePriorityOverrideLog_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CategorizeCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizeUserConsent" ADD CONSTRAINT "CategorizeUserConsent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
