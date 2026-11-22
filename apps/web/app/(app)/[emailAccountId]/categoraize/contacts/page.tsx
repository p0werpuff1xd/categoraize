import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { ContactsTable } from "./ContactsTable";

export default async function CategoraizeContactsPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  return (
    <PageWrapper>
      <PageHeader
        title="Contacts"
        description="Set a sender's role or mark them VIP. Priority uses both: Key people +2, Important +1, and a VIP is raised to at least P4. Changes re-score that sender's emails."
      />
      <ContactsTable />
    </PageWrapper>
  );
}
