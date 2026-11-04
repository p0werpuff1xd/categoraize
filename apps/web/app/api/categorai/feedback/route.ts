import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import prisma from "@/utils/prisma";
import { adaptWithIntelligenceService } from "@/lib/categorai/intelligence-client";
import { categoraiizeFeedback } from "./validation";

export const POST = withError(
  "categorai/feedback",
  withQstashOrInternal(async (request) => {
    const body = categoraiizeFeedback.parse(await request.json());
    const categoryIds = [
      body.correctCategoryId,
      body.incorrectCategoryId,
    ].filter((id): id is string => Boolean(id));
    const categories = await prisma.categorizeCategory.findMany({
      where: {
        emailAccountId: body.emailAccountId,
        id: { in: categoryIds },
      },
      select: { id: true },
    });
    if (categories.length !== categoryIds.length) {
      return new Response("Category not found", { status: 404 });
    }

    const result = await adaptWithIntelligenceService({
      emailVector: body.emailVector,
      correctCentroid: body.correctCentroid,
      incorrectCentroid: body.incorrectCentroid,
    });
    const correctVector = `[${result.correct_centroid.join(",")}]`;

    await prisma.$executeRaw`
      UPDATE "CategorizeCategory"
      SET "centroidEmbedding" = ${correctVector}::vector,
          "centroidVersion" = "centroidVersion" + 1,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${body.correctCategoryId}
        AND "emailAccountId" = ${body.emailAccountId}
    `;

    if (body.incorrectCategoryId && result.incorrect_centroid) {
      const incorrectVector = `[${result.incorrect_centroid.join(",")}]`;
      await prisma.$executeRaw`
        UPDATE "CategorizeCategory"
        SET "centroidEmbedding" = ${incorrectVector}::vector,
            "centroidVersion" = "centroidVersion" + 1,
            "updatedAt" = CURRENT_TIMESTAMP
        WHERE "id" = ${body.incorrectCategoryId}
          AND "emailAccountId" = ${body.emailAccountId}
      `;
    }

    return NextResponse.json({
      correctCategoryId: body.correctCategoryId,
      incorrectCategoryId: body.incorrectCategoryId ?? null,
      alpha: result.alpha,
      beta: result.beta,
    });
  }),
);
