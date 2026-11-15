import { NextResponse } from "next/server";
import { isCategoraizeEnabled } from "@/utils/categoraize/client";
import { getActiveConsent } from "@/utils/categoraize/consent";
import { withAuth } from "@/utils/middleware";

export type CategoraizeConsentResponse = Awaited<ReturnType<typeof getData>>;

export const GET = withAuth("user/categoraize-consent", async (request) =>
  NextResponse.json(await getData(request.auth.userId)),
);

async function getData(userId: string) {
  const consent = await getActiveConsent(userId);
  return {
    // Without CategorAIze the app behaves like the original and is not gated.
    gated: isCategoraizeEnabled(),
    externalLlmEnabled: consent?.externalLlmEnabled ?? false,
    acceptedAt: consent?.acceptedAt ?? null,
  };
}
