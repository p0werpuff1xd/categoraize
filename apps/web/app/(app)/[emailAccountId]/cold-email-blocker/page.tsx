import { Suspense } from "react";
import { t } from "@lingui/core/macro";
import { PermissionsCheck } from "@/app/(app)/[emailAccountId]/PermissionsCheck";
import { EmailLabelsProvider } from "@/providers/EmailLabelsProvider";
import { ColdEmailContent } from "@/app/(app)/[emailAccountId]/cold-email-blocker/ColdEmailContent";
import { PageWrapper } from "@/components/PageWrapper";
import { PageHeader } from "@/components/PageHeader";
import { initLingui } from "@/utils/i18n/server";

export default async function ColdEmailBlockerPage() {
  const i18n = await initLingui();

  return (
    <PageWrapper>
      <PageHeader title={t(i18n)`Cold Email Blocker`} />
      <EmailLabelsProvider>
        <Suspense>
          <PermissionsCheck />
          <div className="mt-4">
            <ColdEmailContent />
          </div>
        </Suspense>
      </EmailLabelsProvider>
    </PageWrapper>
  );
}
