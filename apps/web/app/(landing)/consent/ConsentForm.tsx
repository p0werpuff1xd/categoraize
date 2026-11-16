"use client";

import { useState } from "react";
import Link from "next/link";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toastError } from "@/components/Toast";
import { acceptCategoraizeConsentAction } from "@/utils/actions/categoraize-consent";
import { PRIVACY_PATH, TERMS_PATH } from "@/utils/categoraize/consent-paths";
import { getActionErrorMessage } from "@/utils/error";

export function ConsentForm({ next }: { next: string }) {
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [externalLlmEnabled, setExternalLlmEnabled] = useState(false);
  const accept = useAction(acceptCategoraizeConsentAction, {
    // Hard navigation so the app layout re-checks consent on the server.
    onSuccess: () => window.location.assign(next),
    onError: ({ error }) =>
      toastError({ description: getActionErrorMessage(error) }),
  });

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!acceptTerms) return;
        accept.execute({ acceptTerms: true, externalLlmEnabled });
      }}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          id="accept-terms"
          checked={acceptTerms}
          onCheckedChange={(checked) => setAcceptTerms(checked === true)}
          aria-describedby="accept-terms-hint"
        />
        <Label htmlFor="accept-terms" className="leading-snug font-normal">
          I have read and accept the{" "}
          <Link href={TERMS_PATH} target="_blank" className="underline">
            Terms
          </Link>{" "}
          and the{" "}
          <Link href={PRIVACY_PATH} target="_blank" className="underline">
            Privacy Notice
          </Link>
          . (Required)
        </Label>
      </div>

      <div className="flex items-start gap-3 rounded-lg border p-3">
        <Switch
          id="external-llm"
          checked={externalLlmEnabled}
          onCheckedChange={setExternalLlmEnabled}
        />
        <Label htmlFor="external-llm" className="leading-snug font-normal">
          Allow external AI processing (optional, off by default). Needed for
          AI-drafted replies. Everything else works without it, and you can
          change this later in Settings.
        </Label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/logout"
          className="text-sm text-muted-foreground underline"
        >
          Don't accept and sign out
        </Link>
        <Button
          type="submit"
          disabled={!acceptTerms || accept.isExecuting}
          loading={accept.isExecuting}
        >
          Accept and continue
        </Button>
      </div>
      {!acceptTerms && (
        <p
          id="accept-terms-hint"
          className="text-right text-xs text-muted-foreground"
        >
          Accept the Terms and Privacy Notice to continue.
        </p>
      )}
    </form>
  );
}
