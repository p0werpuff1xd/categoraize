import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export const GET = withEmailAccount("categorai/categories", async (request) => {
  const includeInactive =
    request.nextUrl.searchParams.get("includeInactive") === "true";
  const categories = await prisma.categorizeCategory.findMany({
    where: {
      emailAccountId: request.auth.emailAccountId,
      ...(includeInactive ? {} : { isActive: true }),
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      icon: true,
      classificationThreshold: true,
      isActive: true,
      embeddingModel: true,
      embeddingVersion: true,
      centroidVersion: true,
    },
  });

  return NextResponse.json({ categories });
});
