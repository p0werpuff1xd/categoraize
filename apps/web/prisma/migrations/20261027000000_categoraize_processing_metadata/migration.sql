-- CategorAIze processing metadata, adaptive-vector separation, and reviewable deadlines

ALTER TABLE "CategorizeCategory"
    ADD COLUMN "originalEmbedding" vector(384),
    ADD COLUMN "embeddingModel" TEXT NOT NULL DEFAULT 'paraphrase-multilingual-MiniLM-L12-v2',
    ADD COLUMN "embeddingVersion" TEXT NOT NULL DEFAULT 'v1',
    ADD COLUMN "classificationThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.35,
    ADD COLUMN "centroidVersion" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "CategorizeClassification"
    ADD COLUMN "processingStatus" TEXT NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "processingError" TEXT,
    ADD COLUMN "processingKey" TEXT,
    ADD COLUMN "rawPriorityScore" DOUBLE PRECISION,
    ADD COLUMN "deadlineFactor" DOUBLE PRECISION,
    ADD COLUMN "senderFactor" DOUBLE PRECISION,
    ADD COLUMN "calendarFactor" DOUBLE PRECISION,
    ADD COLUMN "priorityDampener" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    ADD COLUMN "priorityOverride" TEXT,
    ADD COLUMN "priorityOverrideReason" TEXT,
    ADD COLUMN "priorityBand" TEXT NOT NULL DEFAULT 'P1';

UPDATE "CategorizeClassification"
SET "processingKey" = CONCAT("emailAccountId", ':', "threadId", ':', "messageId")
WHERE "processingKey" IS NULL;

ALTER TABLE "CategorizeClassification"
    ALTER COLUMN "processingKey" SET NOT NULL;

CREATE UNIQUE INDEX "CategorizeClassification_emailAccountId_processingKey_key"
    ON "CategorizeClassification"("emailAccountId", "processingKey");

ALTER TABLE "CategorizeDeadlineAlert"
    ADD COLUMN "sourceText" TEXT,
    ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC',
    ADD COLUMN "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    ADD COLUMN "needsReview" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "confirmedAt" TIMESTAMP(3);
