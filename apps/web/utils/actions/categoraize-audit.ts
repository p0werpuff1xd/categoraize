"use server";

import { actionClientUser } from "@/utils/actions/safe-action";
import { recordAuditEvent } from "@/utils/categoraize/audit";

/** Called by the client just before signing out, while the session still exists. */
export const recordLogoutAction = actionClientUser
  .metadata({ name: "recordLogout" })
  .action(async ({ ctx: { userId } }) => {
    await recordAuditEvent({ eventType: "logout", userId });
  });
