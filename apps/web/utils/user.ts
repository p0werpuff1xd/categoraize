"use client";

import { clearOfflineMailCache } from "@/utils/offline/clear-mail-cache";
import { signOut } from "@/utils/auth-client";
import { clearLastEmailAccountAction } from "@/utils/actions/email-account-cookie";
import { recordLogoutAction } from "@/utils/actions/categoraize-audit";
import { redirectToSafeUrl } from "@/utils/redirect";
import { closeActiveMailEngine } from "@/utils/mail-engine/active-client";
import { wipeLocalMailbox } from "@/utils/mail-engine/wipe-local-mailbox";
import { clearLocalReplyDrafts } from "@/utils/mail-engine/reply-drafts";
import { clearPersistedSwrCache } from "@/utils/swr-persistence";

export async function logOut(callbackUrl?: string) {
  // Best effort: a failed audit write must never block signing out.
  await recordLogoutAction().catch(() => undefined);
  await closeActiveMailEngine();
  clearLastEmailAccountAction();
  clearPersistedSwrCache();
  clearLocalReplyDrafts();
  await clearOfflineMailCache();
  await wipeLocalMailbox();

  await signOut({
    fetchOptions: {
      onSuccess: () => {
        redirectToSafeUrl(callbackUrl);
      },
      onError: () => {
        redirectToSafeUrl(callbackUrl);
      },
    },
  });
}
