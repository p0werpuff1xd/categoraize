import { NextResponse } from "next/server";
import { getPriorityProposals } from "@/utils/categoraize/proposals";
import { withEmailAccount } from "@/utils/middleware";

export type CategoraizeProposalsResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withEmailAccount("categorai/proposals", async (request) =>
  NextResponse.json(await getData(request.auth.emailAccountId)),
);

async function getData(emailAccountId: string) {
  return { proposals: await getPriorityProposals(emailAccountId) };
}
