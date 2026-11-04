import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import prisma from "@/utils/prisma";
import { embedWithIntelligenceService } from "@/lib/categorai/intelligence-client";
import { embedCategoraiizeCategory } from "./validation";

export const maxDuration = 60;

export const POST = withError(
  "categorai/embed-category",
  withQstashOrInternal(async (request) => {
    const body = embedCategoraiizeCategory.parse(await request.json());
    const category = await prisma.categorizeCategory.findFirst({
      where: {
        id: body.categoryId,
        emailAccountId: body.emailAccountId,
      },
      select: { id: true },
    });

    if (!category) return new Response("Category not found", { status: 404 });

    const embeddingResult = await embedWithIntelligenceService([
      `${body.name}\n${body.description ?? ""}`,
    ]);
    const [embedding] = embeddingResult.embeddings;
    if (!embedding || embeddingResult.dimension !== 384) {
      return new Response("Invalid embedding response", { status: 502 });
    }

    const vector = `[${embedding.join(",")}]`;
    await prisma.$executeRaw`
      UPDATE "CategorizeCategory"
      SET "originalEmbedding" = ${vector}::vector,
          "centroidEmbedding" = COALESCE("centroidEmbedding", ${vector}::vector),
          "embeddingModel" = ${embeddingResult.model},
          "embeddingVersion" = 'v1',
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${body.categoryId}
        AND "emailAccountId" = ${body.emailAccountId}
    `;

    return NextResponse.json({
      categoryId: body.categoryId,
      model: embeddingResult.model,
      dimension: embeddingResult.dimension,
    });
  }),
);
