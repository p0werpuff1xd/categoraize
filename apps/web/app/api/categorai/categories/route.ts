import { NextResponse } from "next/server";
import { withEmailAccount } from "@/utils/middleware";
import prisma from "@/utils/prisma";

export type CategoraizeCategoriesResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("categorai/categories", async (request) => {
  const includeInactive =
    request.nextUrl.searchParams.get("includeInactive") === "true";
  return NextResponse.json(
    await getData({
      emailAccountId: request.auth.emailAccountId,
      includeInactive,
    }),
  );
});

async function getData({
  emailAccountId,
  includeInactive,
}: {
  emailAccountId: string;
  includeInactive: boolean;
}) {
  const categories = await prisma.categorizeCategory.findMany({
    where: { emailAccountId, ...(includeInactive ? {} : { isActive: true }) },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      basePriority: true,
      classificationThreshold: true,
      isActive: true,
      centroidVersion: true,
      _count: { select: { classifications: true } },
    },
  });
  const [calendarConnections, examples] = await Promise.all([
    prisma.calendarConnection.count({
      where: { emailAccountId, isConnected: true },
    }),
    // Examples: emails the user put in a label themselves (taught, corrected
    // or confirmed); each label's centroid is built from them.
    prisma.categorizeClassification.groupBy({
      by: ["categoryId"],
      where: { emailAccountId, isReviewedByUser: true, categoryId: { not: null } },
      _count: { _all: true },
    }),
  ]);
  const exampleCount = new Map(
    examples.map((row) => [row.categoryId, row._count._all]),
  );
  // The priority panels say whether a calendar could have added a boost.
  return {
    categories: categories.map((category) => ({
      ...category,
      exampleCount: exampleCount.get(category.id) ?? 0,
    })),
    calendarConnected: calendarConnections > 0,
  };
}
