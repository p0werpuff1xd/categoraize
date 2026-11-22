import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { PriorityInbox } from "./PriorityInbox";

export default async function CategoraizeTriagePage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  return (
    <PageWrapper>
      <PageHeader
        title="Priority Inbox"
        description="Emails ranked P5 to P1 by label, deadline, sender role and VIP status. Open an email to see why, correct its label, or override its priority."
      />
      <PriorityInbox />
    </PageWrapper>
  );
}
