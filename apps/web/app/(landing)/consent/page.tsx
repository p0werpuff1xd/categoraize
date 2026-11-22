import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ConsentForm } from "@/app/(landing)/consent/ConsentForm";
import { auth } from "@/utils/auth";
import { hasAcceptedCurrentTerms } from "@/utils/categoraize/consent";
import { WELCOME_PATH } from "@/utils/config";
import { BRAND_NAME, getBrandTitle } from "@/utils/branding";
import { normalizeInternalPath } from "@/utils/path";

export const metadata: Metadata = {
  title: getBrandTitle("Terms and privacy"),
  robots: { index: false, follow: false },
};

/**
 * FR-1.8: shown after sign-in and before the app reads any mailbox. The
 * Terms and Privacy Notice are required; external AI processing is optional
 * and off by default.
 */
export default async function ConsentPage(props: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if (!session?.user) redirect("/login");

  const next = normalizeInternalPath(searchParams?.next) ?? WELCOME_PATH;
  if (await hasAcceptedCurrentTerms(session.user.id)) redirect(next);

  return (
    <div className="flex min-h-screen flex-col justify-center px-4 py-10 text-foreground">
      <div className="mx-auto w-full max-w-xl space-y-6">
        <div className="text-center">
          <h1 className="font-title text-2xl">Before we read your mailbox</h1>
          <p className="mt-3 text-muted-foreground">
            {BRAND_NAME} needs your consent before it reads any email.
          </p>
        </div>

        <ul className="list-disc space-y-2 rounded-lg border p-4 pl-8 text-sm">
          <li>
            <strong>What we process:</strong> the sender, subject and text of
            your emails, to sort them into your labels, find tasks and
            deadlines, set a priority and write short summaries.
          </li>
          <li>
            <strong>Where:</strong> on {BRAND_NAME}'s own language service. It
            receives no passwords or account tokens and keeps no copy of your
            email.
          </li>
          <li>
            <strong>External AI (optional):</strong> only if you turn it on,
            drafted replies and some unsure decisions send the needed part of an
            email to an external AI provider (OpenRouter).
          </li>
          <li>
            <strong>Your rights</strong> under the Data Privacy Act of 2012 (RA
            10173): access, correct, erase, object and withdraw this consent at
            any time in Settings.
          </li>
        </ul>

        <ConsentForm next={next} />
      </div>
    </div>
  );
}
