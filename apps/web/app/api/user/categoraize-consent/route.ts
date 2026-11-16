import { NextResponse } from "next/server";
import { isCategoraizeEnabled } from "@/utils/categoraize/client";
import {
  CATEGORAIZE_PRIVACY_VERSION,
  CATEGORAIZE_TERMS_VERSION,
  getActiveConsent,
} from "@/utils/categoraize/consent";
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
    accepted: Boolean(consent),
    externalLlmEnabled: consent?.externalLlmEnabled ?? false,
    acceptedAt: consent?.acceptedAt ?? null,
    termsVersion: CATEGORAIZE_TERMS_VERSION,
    privacyVersion: CATEGORAIZE_PRIVACY_VERSION,
  };
}
