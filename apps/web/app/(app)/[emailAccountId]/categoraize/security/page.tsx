import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { SecurityLog } from "./SecurityLog";

export default async function SecurityLogPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  return (
    <PageWrapper>
      <PageHeader
        title="Security log"
        description="Sign-ins, connected accounts and consent changes for your account. Read-only: entries cannot be changed or deleted, and they never contain email content."
      />
      <SecurityLog />
    </PageWrapper>
  );
}
