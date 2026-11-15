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
  const calendarConnections = await prisma.calendarConnection.count({
    where: { emailAccountId, isConnected: true },
  });
  // The priority panels say whether a calendar could have added a boost.
  return { categories, calendarConnected: calendarConnections > 0 };
}
