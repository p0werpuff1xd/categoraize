import { PageHeader } from "@/components/PageHeader";
import { PageWrapper } from "@/components/PageWrapper";
import { ServiceStatusBanner } from "@/components/CategoraizeStates";
import { checkUserOwnsEmailAccount } from "@/utils/email-account";
import { CategoryTaxonomy } from "./CategoryTaxonomy";
import { ClassificationSandbox } from "./ClassificationSandbox";
import { SuggestedLabels } from "./SuggestedLabels";

export default async function CategoraizeRulesPage({
  params,
}: {
  params: Promise<{ emailAccountId: string }>;
}) {
  const { emailAccountId } = await params;
  await checkUserOwnsEmailAccount({ emailAccountId });

  return (
    <PageWrapper>
      <PageHeader
        title="Label Studio"
        description="Describe each label in plain English, Filipino or Taglish. Emails are matched to labels by meaning (Sentence-BERT), and your corrections tune each label over time."
      />
      <div className="mt-6">
        <ServiceStatusBanner />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="space-y-6">
          <SuggestedLabels />
          <CategoryTaxonomy />
        </div>
        <ClassificationSandbox />
      </div>
    </PageWrapper>
  );
}
