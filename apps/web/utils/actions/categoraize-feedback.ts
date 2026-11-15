"use server";

import { revalidatePath } from "next/cache";
import { actionClient } from "@/utils/actions/safe-action";
import { getPriorityProposals } from "@/utils/categoraize/proposals";
import { rescoreClassifications } from "@/utils/categoraize/rescore";
import { SafeError } from "@/utils/error";
import { prefixPath } from "@/utils/path";
import prisma from "@/utils/prisma";
import { answerPriorityProposal } from "./categoraize-feedback.validation";

/**
 * Accept or decline a priority suggestion. Accepting applies it (label base
 * priority or sender VIP) and re-scores the affected emails; either answer is
 * remembered so the suggestion is not shown again.
 */
export const answerPriorityProposalAction = actionClient
  .metadata({ name: "answerPriorityProposal" })
  .inputSchema(answerPriorityProposal)
  .action(async ({ ctx: { emailAccountId, logger }, parsedInput }) => {
    const proposal = (await getPriorityProposals(emailAccountId)).find(
      ({ key }) => key === parsedInput.key,
    );
    if (!proposal) throw new SafeError("This suggestion is no longer current");

    let rescored = 0;
    if (parsedInput.accept && proposal.kind === "category_base") {
      await prisma.categorizeCategory.update({
        where: { id: proposal.categoryId, emailAccountId },
        data: { basePriority: proposal.to },
      });
      rescored = await rescoreClassifications({
        emailAccountId,
        where: { categoryId: proposal.categoryId },
        logger,
      });
    } else if (parsedInput.accept && proposal.kind === "sender_vip") {
      await prisma.categorizeContact.upsert({
        where: {
          emailAccountId_email: { emailAccountId, email: proposal.sender },
        },
        create: {
          emailAccountId,
          email: proposal.sender,
          isVip: proposal.makeVip,
        },
        update: { isVip: proposal.makeVip },
      });
      rescored = await rescoreClassifications({
        emailAccountId,
        where: { fromEmail: { equals: proposal.sender, mode: "insensitive" } },
        logger,
      });
    }

    await prisma.categorizeProposalDecision.upsert({
      where: { emailAccountId_key: { emailAccountId, key: proposal.key } },
      create: {
        emailAccountId,
        key: proposal.key,
        accepted: parsedInput.accept,
      },
      update: { accepted: parsedInput.accept },
    });

    revalidatePath(prefixPath(emailAccountId, "/categoraize"), "layout");
    return { accepted: parsedInput.accept, rescored };
  });
