-- CreateTable
CREATE TABLE "CategorizeSenderCategoryCentroid" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "centroid" vector(384),
    "centroidVersion" INTEGER NOT NULL DEFAULT 0,
    "categoryId" TEXT NOT NULL,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "CategorizeSenderCategoryCentroid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CategorizeSenderEmbedding" (
    "id" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "sender" TEXT NOT NULL,
    "embedding" vector(384),
    "learnedCategoryId" TEXT,
    "emailAccountId" TEXT NOT NULL,

    CONSTRAINT "CategorizeSenderEmbedding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CategorizeSenderCategoryCentroid_categoryId_key" ON "CategorizeSenderCategoryCentroid"("categoryId");

-- CreateIndex
CREATE INDEX "CategorizeSenderCategoryCentroid_emailAccountId_idx" ON "CategorizeSenderCategoryCentroid"("emailAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "CategorizeSenderEmbedding_emailAccountId_sender_key" ON "CategorizeSenderEmbedding"("emailAccountId", "sender");

-- AddForeignKey
ALTER TABLE "CategorizeSenderCategoryCentroid" ADD CONSTRAINT "CategorizeSenderCategoryCentroid_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizeSenderCategoryCentroid" ADD CONSTRAINT "CategorizeSenderCategoryCentroid_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CategorizeSenderEmbedding" ADD CONSTRAINT "CategorizeSenderEmbedding_emailAccountId_fkey" FOREIGN KEY ("emailAccountId") REFERENCES "EmailAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
