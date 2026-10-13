-- =============================================================================
-- CategorAIze: pgvector extension + core models + HNSW vector indexes
-- Migration: 20261014000000_categoraize_pgvector
-- =============================================================================

-- Enable pgvector extension (must be done before vector columns are created)
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "CategorizePriorityLevel" AS ENUM ('URGENT', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "CategorizeDeadlineStatus" AS ENUM ('PENDING', 'NOTIFIED', 'COMPLETED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "CategorizeNotificationType" AS ENUM ('URGENT_EMAIL', 'DEADLINE_APPROACHING', 'CLASSIFICATION_SUMMARY', 'SYSTEM');

-- CreateTable: User-defined zero-shot categories with Rocchio centroid vectors
CREATE TABLE "CategorizeCategory" (
    "id"                TEXT NOT NULL,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    "name"              TEXT NOT NULL,
    "description"       TEXT,
    "color"             TEXT,
    "icon"              TEXT,
    "aiInstructions"    TEXT,
    "priorityWeight"    INTEGER NOT NULL DEFAULT 1,
    "isDefault"         BOOLEAN NOT NULL DEFAULT false,
    "emailAccountId"    TEXT NOT NULL,
    -- Rocchio centroid: L2-normalised vector(384) from MiniLM-L12-v2
    "centroidEmbedding" vector(384),

    CONSTRAINT "CategorizeCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable: Per-email AI classification results, priority scores, and dense embeddings
CREATE TABLE "CategorizeClassification" (
    "id"               TEXT NOT NULL,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "threadId"         TEXT NOT NULL,
    "messageId"        TEXT NOT NULL,
    "emailAccountId"   TEXT NOT NULL,
    "categoryId"       TEXT,
    "categoryName"     TEXT,
    "confidence"       DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "priority"         "CategorizePriorityLevel" NOT NULL DEFAULT 'MEDIUM',
    "priorityScore"    DOUBLE PRECISION NOT NULL DEFAULT 50.0,
    "urgency"          INTEGER NOT NULL DEFAULT 1,
    "importance"       INTEGER NOT NULL DEFAULT 1,
    "aiReasoning"      TEXT,
    "summary"          TEXT,
    "isReviewedByUser" BOOLEAN NOT NULL DEFAULT false,
    "userCorrection"   TEXT,
    -- Dense MiniLM-L12-v2 email embedding for cosine similarity search via pgvector
    "embedding"        vector(384),
    -- langdetect output: "en", "tl", or "taglish"
    "detectedLang"     TEXT,
    -- Extracted imperative directive (e.g. "Pa-check nung Redis lag")
    "actionDirective"  TEXT,

    CONSTRAINT "CategorizeClassification_pkey" PRIMARY KEY ("id")
);

-- CreateTable: AI-extracted deadline alerts from email content
CREATE TABLE "CategorizeDeadlineAlert" (
    "id"             TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    "threadId"       TEXT NOT NULL,
    "messageId"      TEXT NOT NULL,
    "title"          TEXT NOT NULL,
    "description"    TEXT,
    "dueDate"        TIMESTAMP(3) NOT NULL,
    "priority"       "CategorizePriorityLevel" NOT NULL DEFAULT 'HIGH',
    "status"         "CategorizeDeadlineStatus" NOT NULL DEFAULT 'PENDING',
    "notifiedAt"     TIMESTAMP(3),
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "CategorizeDeadlineAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable: In-app notifications for priority escalations and deadline reminders
CREATE TABLE "CategorizeNotification" (
    "id"              TEXT NOT NULL,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type"            "CategorizeNotificationType" NOT NULL,
    "title"           TEXT NOT NULL,
    "message"         TEXT NOT NULL,
    "read"            BOOLEAN NOT NULL DEFAULT false,
    "threadId"        TEXT,
    "messageId"       TEXT,
    "emailAccountId"  TEXT NOT NULL,
    "deadlineAlertId" TEXT,

    CONSTRAINT "CategorizeNotification_pkey" PRIMARY KEY ("id")
);

-- =============================================================================
-- Indexes: standard B-tree indexes
-- =============================================================================

CREATE UNIQUE INDEX "CategorizeCategory_emailAccountId_name_key"
    ON "CategorizeCategory"("emailAccountId", "name");

CREATE INDEX "CategorizeCategory_emailAccountId_idx"
    ON "CategorizeCategory"("emailAccountId");

CREATE UNIQUE INDEX "CategorizeClassification_emailAccountId_threadId_messageId_key"
    ON "CategorizeClassification"("emailAccountId", "threadId", "messageId");

CREATE INDEX "CategorizeClassification_emailAccountId_priority_idx"
    ON "CategorizeClassification"("emailAccountId", "priority");

CREATE INDEX "CategorizeClassification_emailAccountId_categoryId_idx"
    ON "CategorizeClassification"("emailAccountId", "categoryId");

CREATE INDEX "CategorizeClassification_emailAccountId_createdAt_idx"
    ON "CategorizeClassification"("emailAccountId", "createdAt");

CREATE INDEX "CategorizeDeadlineAlert_emailAccountId_status_dueDate_idx"
    ON "CategorizeDeadlineAlert"("emailAccountId", "status", "dueDate");

CREATE INDEX "CategorizeDeadlineAlert_emailAccountId_threadId_idx"
    ON "CategorizeDeadlineAlert"("emailAccountId", "threadId");

CREATE INDEX "CategorizeNotification_emailAccountId_read_createdAt_idx"
    ON "CategorizeNotification"("emailAccountId", "read", "createdAt");

CREATE INDEX "CategorizeNotification_emailAccountId_type_idx"
    ON "CategorizeNotification"("emailAccountId", "type");

-- =============================================================================
-- HNSW vector indexes for cosine similarity search (pgvector)
-- O(log N) approximate nearest-neighbour vs O(N·D) linear scan
-- ef_construction=128, m=16 recommended for 384-dim MiniLM embeddings
-- =============================================================================

-- Email embedding index — used by FastAPI /api/v1/search for semantic queries
CREATE INDEX "CategorizeClassification_embedding_hnsw_idx"
    ON "CategorizeClassification"
    USING hnsw ("embedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

-- Category centroid index — used by Rocchio cosine matcher for zero-shot routing
CREATE INDEX "CategorizeCategory_centroidEmbedding_hnsw_idx"
    ON "CategorizeCategory"
    USING hnsw ("centroidEmbedding" vector_cosine_ops)
    WITH (m = 16, ef_construction = 128);

-- =============================================================================
-- Foreign key constraints
-- =============================================================================

ALTER TABLE "CategorizeCategory"
    ADD CONSTRAINT "CategorizeCategory_emailAccountId_fkey"
    FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CategorizeClassification"
    ADD CONSTRAINT "CategorizeClassification_emailAccountId_fkey"
    FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CategorizeClassification"
    ADD CONSTRAINT "CategorizeClassification_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "CategorizeCategory"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CategorizeDeadlineAlert"
    ADD CONSTRAINT "CategorizeDeadlineAlert_emailAccountId_fkey"
    FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CategorizeNotification"
    ADD CONSTRAINT "CategorizeNotification_emailAccountId_fkey"
    FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CategorizeNotification"
    ADD CONSTRAINT "CategorizeNotification_deadlineAlertId_fkey"
    FOREIGN KEY ("deadlineAlertId") REFERENCES "CategorizeDeadlineAlert"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
