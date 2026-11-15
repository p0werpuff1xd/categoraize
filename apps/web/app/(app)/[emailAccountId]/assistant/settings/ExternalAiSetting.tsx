"use client";

import { useLingui } from "@lingui/react/macro";
import { useAction } from "next-safe-action/hooks";
import { Toggle } from "@/components/Toggle";
import { SettingCard } from "@/components/SettingCard";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError, toastSuccess } from "@/components/Toast";
import { useCategoraizeConsent } from "@/hooks/useCategoraize";
import { setExternalLlmConsentAction } from "@/utils/actions/categoraize-consent";
import { getActionErrorMessage } from "@/utils/error";

/**
 * The optional external-LLM choice (off by default). Sorting, labels,
 * priorities and summaries run on CategorAIze's own service and never need it.
 */
export function ExternalAiSetting() {
  const { t } = useLingui();
  const { data, isLoading, error, mutate } = useCategoraizeConsent();
  const { execute, isExecuting } = useAction(setExternalLlmConsentAction, {
    onSuccess: ({ data: result }) => {
      toastSuccess({
        description: result?.externalLlmEnabled
          ? t`External AI processing is on. AI drafts and Reply Zero can run.`
          : t`External AI processing is off. Nothing is sent to the external AI provider.`,
      });
      mutate();
    },
    onError: ({ error: actionError }) => {
      mutate();
      toastError({ description: getActionErrorMessage(actionError) });
    },
  });

  if (data && !data.gated) return null;

  return (
    <SettingCard
      title={t`External AI processing`}
      description={t`Optional, off by default. When on, AI drafts and Reply Zero send the email thread to your configured AI provider (OpenRouter) to write replies. Smart sorting, labels, priorities and summaries always run on CategorAIze's own service and never need this.`}
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="external-ai"
            enabled={data?.externalLlmEnabled ?? false}
            disabled={isExecuting}
            onChange={(enabled) => {
              mutate(
                (current) =>
                  current && { ...current, externalLlmEnabled: enabled },
                { revalidate: false },
              );
              execute({ enabled });
            }}
          />
        </LoadingContent>
      }
    />
  );
}
