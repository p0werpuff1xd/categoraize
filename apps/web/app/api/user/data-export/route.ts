import { NextResponse } from "next/server";
import { recordAuditEvent } from "@/utils/categoraize/audit";
import { withAuth } from "@/utils/middleware";
import { buildExport } from "@/utils/categoraize/data-export";
import prisma from "@/utils/prisma";

const EXPORTS_PER_HOUR = 3;
const HOUR_MS = 60 * 60 * 1000;

/**
 * "Download my data" (RA 10173 right to access and data portability).
 * The user's CategorAIze data as JSON: no access tokens, no secrets and no
 * raw email bodies (bodyText and snippet are left out). Rate-limited and logged.
 */
export const GET = withAuth("user/data-export", async (request) => {
  const userId = request.auth.userId;

  const recent = await prisma.categorizeAuditEvent.count({
    where: {
      userId,
      eventType: "export_requested",
      createdAt: { gte: new Date(Date.now() - HOUR_MS) },
    },
  });
  if (recent >= EXPORTS_PER_HOUR) {
    return NextResponse.json(
      { error: "Too many downloads. Try again in an hour." },
      { status: 429, headers: { "Retry-After": "3600" } },
    );
  }

  await recordAuditEvent({ eventType: "export_requested", userId });
  const data = await buildExport(userId);
  const date = new Date().toISOString().slice(0, 10);

  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="categoraize-data-${date}.json"`,
      "Cache-Control": "no-store",
    },
  });
});
