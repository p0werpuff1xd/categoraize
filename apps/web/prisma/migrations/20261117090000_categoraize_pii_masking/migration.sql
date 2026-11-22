-- IAS Phase 11 J: per-user PII masking setting and masked counts.

-- CreateTable
CREATE TABLE "CategorizeUserSettings" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "piiMaskingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT NOT NULL,

    CONSTRAINT "CategorizeUserSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategorizeUserSettings_userId_key" ON "CategorizeUserSettings"("userId");

-- AddForeignKey
ALTER TABLE "CategorizeUserSettings" ADD CONSTRAINT "CategorizeUserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CategorizeClassification" ADD COLUMN "piiMaskedCount" INTEGER NOT NULL DEFAULT 0;
