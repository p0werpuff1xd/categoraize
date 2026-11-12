-- CategorAIze Phase 2: priority/spans/contacts/feedback data for the NLP service v0.2 contract.
-- Written by hand from `prisma migrate diff`, keeping only these changes (the diff also
-- proposes dropping hand-made HNSW and partial indexes, which must stay).

-- CreateEnum
CREATE TYPE "CategorizeSpanLabel" AS ENUM ('TASK', 'DATE');

-- CreateEnum
CREATE TYPE "CategorizeContactRole" AS ENUM ('DIRECT_REPORT', 'MANAGER', 'DIRECTOR_EXECUTIVE', 'EXTERNAL_VENDOR');

-- AlterTable
ALTER TABLE "CategorizeCategory" ADD COLUMN     "basePriority" INTEGER NOT NULL DEFAULT 3;

-- AlterTable
ALTER TABLE "CategorizeClassification" ADD COLUMN     "computedPriority" INTEGER NOT NULL DEFAULT 3,
ADD COLUMN     "deadlineAt" TIMESTAMP(3),
ADD COLUMN     "fromEmail" TEXT,
ADD COLUMN     "fromName" TEXT,
ADD COLUMN     "manualPriority" INTEGER,
ADD COLUMN     "priorityFactors" JSONB,
ADD COLUMN     "rankedCategories" JSONB,
ADD COLUMN     "receivedAt" TIMESTAMP(3),
ADD COLUMN     "serviceVersion" TEXT,
ADD COLUMN     "snippet" TEXT,
ADD COLUMN     "bodyText" TEXT,
ADD COLUMN     "subject" TEXT,
ADD COLUMN     "suggestedLabel" JSONB;

-- CreateTable
CREATE TABLE "CategorizeExtractedSpan" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "label" "CategorizeSpanLabel" NOT NULL,
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "start" INTEGER NOT NULL,
    "end" INTEGER NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "ambiguous" BOOLEAN NOT NULL DEFAULT false,
    "isDeadline" BOOLEAN NOT NULL DEFAULT false,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "dismissedAt" TIMESTAMP(3),
    "tagger" TEXT NOT NULL DEFAULT 'regex',
    "classificationId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

CONSTRAINT "CategorizeExtractedSpan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorizeContact" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "role" "CategorizeContactRole",
    "isVip" BOOLEAN NOT NULL DEFAULT false,
    "emailAccountId" TEXT NOT NULL,

CONSTRAINT "CategorizeContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorizeFeedbackEvent" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fromCategoryId" TEXT,
    "toCategoryId" TEXT NOT NULL,
    "classificationId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

CONSTRAINT "CategorizeFeedbackEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorizePriorityOverrideLog" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sender" TEXT NOT NULL,
    "computedPriority" INTEGER NOT NULL,
    "manualPriority" INTEGER,
    "classificationId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

CONSTRAINT "CategorizePriorityOverrideLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CategorizeExtractedSpan_classificationId_idx" ON "CategorizeExtractedSpan"("classificationId");

-- CreateIndex
CREATE INDEX "CategorizeExtractedSpan_emailAccountId_label_resolvedAt_idx" ON "CategorizeExtractedSpan"("emailAccountId", "label", "resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CategorizeContact_emailAccountId_email_key" ON "CategorizeContact"("emailAccountId", "email");

-- CreateIndex
CREATE INDEX "CategorizeFeedbackEvent_emailAccountId_createdAt_idx" ON "CategorizeFeedbackEvent"("emailAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CategorizeFeedbackEvent_classificationId_toCategoryId_key" ON "CategorizeFeedbackEvent"("classificationId", "toCategoryId");

-- CreateIndex
CREATE INDEX "CategorizePriorityOverrideLog_emailAccountId_sender_created_idx" ON "CategorizePriorityOverrideLog"("emailAccountId", "sender", "createdAt");

-- CreateIndex
CREATE INDEX "CategorizeClassification_emailAccountId_computedPriority_idx" ON "CategorizeClassification"("emailAccountId", "computedPriority");

-- AddForeignKey
ALTER TABLE "CategorizeExtractedSpan" ADD CONSTRAINT "CategorizeExtractedSpan_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "CategorizeClassification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizeExtractedSpan" ADD CONSTRAINT "CategorizeExtractedSpan_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizeContact" ADD CONSTRAINT "CategorizeContact_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizeFeedbackEvent" ADD CONSTRAINT "CategorizeFeedbackEvent_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "CategorizeClassification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizeFeedbackEvent" ADD CONSTRAINT "CategorizeFeedbackEvent_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizePriorityOverrideLog" ADD CONSTRAINT "CategorizePriorityOverrideLog_classificationId_fkey" FOREIGN KEY ("classificationId") REFERENCES "CategorizeClassification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizePriorityOverrideLog" ADD CONSTRAINT "CategorizePriorityOverrideLog_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
