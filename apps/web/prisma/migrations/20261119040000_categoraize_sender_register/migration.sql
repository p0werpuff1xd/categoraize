-- Sender tone (formal | neutral | casual) from the NLP service; NULL until re-scored.
ALTER TABLE "CategorizeClassification" ADD COLUMN "senderRegister" TEXT;
