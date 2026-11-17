"use client";

import { useAction } from "next-safe-action/hooks";
import { LoadingContent } from "@/components/LoadingContent";
import { SettingCard } from "@/components/SettingCard";
import { Toggle } from "@/components/Toggle";
import { Skeleton } from "@/components/ui/skeleton";
import { toastError, toastSuccess } from "@/components/Toast";
import { useCategoraizeConsent } from "@/hooks/useCategoraize";
import { setPiiMaskingAction } from "@/utils/actions/categoraize-consent";
import { getActionErrorMessage } from "@/utils/error";

/** IAS Phase 11 J: mask phone, card and government ID numbers (on by default). */
export function PiiMaskingSetting() {
  const { data, isLoading, error, mutate } = useCategoraizeConsent();
  const { execute, isExecuting } = useAction(setPiiMaskingAction, {
    onSuccess: ({ data: result }) => {
      toastSuccess({
        description: result?.piiMaskingEnabled
          ? "Masking is on for emails analyzed from now on and for external AI requests."
          : "Masking is off. New emails are stored and analyzed with these numbers.",
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
      title="Mask personal numbers"
      description="On by default. Mobile numbers, card numbers, and SSS, PhilHealth and TIN numbers are replaced with [PHONE], [CARD] and [GOV_ID] before an email is analyzed or stored, and before anything is sent to the external AI. Only the number of masked items is kept. Applies to emails analyzed from now on."
      right={
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="h-8 w-32" />}
        >
          <Toggle
            name="pii-masking"
            enabled={data?.piiMaskingEnabled ?? true}
            disabled={isExecuting}
            onChange={(enabled) => {
              mutate(
                (current) =>
                  current && { ...current, piiMaskingEnabled: enabled },
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
