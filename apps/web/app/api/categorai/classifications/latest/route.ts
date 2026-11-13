import { NextResponse } from "next/server";
import { getClassificationStats } from "@/utils/categoraize/classification-stats";
import { withEmailAccount } from "@/utils/middleware";

export type CategoraizeLatestResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount(
  "categorai/classifications/latest",
  async (request) =>
    NextResponse.json(await getData(request.auth.emailAccountId)),
);

function getData(emailAccountId: string) {
  return getClassificationStats(emailAccountId);
}
