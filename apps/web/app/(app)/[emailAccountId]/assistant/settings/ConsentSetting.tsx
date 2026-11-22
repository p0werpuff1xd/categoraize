"use client";

import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingCard } from "@/components/SettingCard";
import { toastError } from "@/components/Toast";
import { useCategoraizeConsent } from "@/hooks/useCategoraize";
import { withdrawCategoraizeConsentAction } from "@/utils/actions/categoraize-consent";
import {
  CONSENT_PATH,
  PRIVACY_PATH,
  TERMS_PATH,
} from "@/utils/categoraize/consent-paths";
import { getActionErrorMessage } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import { useAccount } from "@/providers/EmailAccountProvider";

/** Review or withdraw the Terms and Privacy Notice consent (RA 10173). */
export function ConsentSetting() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error } = useCategoraizeConsent();
  const withdraw = useAction(withdrawCategoraizeConsentAction, {
    // Hard navigation: the app layout re-checks consent on the server.
    onSuccess: () => window.location.assign(CONSENT_PATH),
    onError: ({ error: actionError }) =>
      toastError({ description: getActionErrorMessage(actionError) }),
  });

  if (data && !data.gated) return null;

  return (
    <SettingCard
      title="Terms and Privacy Notice"
      description={describe({ data, isLoading, error })}
      right={
        <div className="flex flex-col items-end gap-2">
          <div className="flex gap-3 text-sm">
            <Link href={TERMS_PATH} target="_blank" className="underline">
              Terms
            </Link>
            <Link href={PRIVACY_PATH} target="_blank" className="underline">
              Privacy Notice
            </Link>
            <Link
              href={prefixPath(emailAccountId, "/categoraize/security")}
              className="underline"
            >
              Security log
            </Link>
          </div>
          <ConfirmDialog
            trigger={
              <Button
                variant="outline"
                size="sm"
                disabled={!data?.accepted || withdraw.isExecuting}
                loading={withdraw.isExecuting}
              >
                Withdraw consent
              </Button>
            }
            title="Withdraw your consent?"
            description="CategorAIze will stop reading your mailbox and you will be asked to accept the Terms again before you can use the app. Your labels, settings and analyzed emails are kept; to erase them, delete your account instead."
            confirmText="Withdraw consent"
            onConfirm={() => withdraw.execute()}
          />
        </div>
      }
    />
  );
}

function describe({
  data,
  isLoading,
  error,
}: Pick<
  ReturnType<typeof useCategoraizeConsent>,
  "data" | "isLoading" | "error"
>) {
  if (isLoading) return "Loading your consent…";
  if (error || !data) return "Couldn't load your consent. Reload to try again.";
  if (!data.accepted || !data.acceptedAt) {
    return "Not accepted for the current version.";
  }
  const acceptedOn = new Date(data.acceptedAt).toLocaleString();
  return `Accepted on ${acceptedOn} (Terms ${data.termsVersion}, Privacy Notice ${data.privacyVersion}). External AI processing is ${data.externalLlmEnabled ? "on" : "off"}.`;
}
