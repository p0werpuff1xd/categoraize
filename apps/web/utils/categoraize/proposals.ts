import prisma from "@/utils/prisma";

/** How many consecutive same-direction overrides trigger a suggestion (plan section 7). */
export const PROPOSAL_STREAK = 3;

export type PriorityProposal =
  | {
      key: string;
      kind: "category_base";
      categoryId: string;
      categoryName: string;
      from: number;
      to: number;
      direction: "up" | "down";
    }
  | {
      key: string;
      kind: "sender_vip";
      sender: string;
      makeVip: boolean;
      direction: "up" | "down";
    };

/**
 * Suggestions from the user's manual priority overrides. Nothing changes until
 * the user accepts one; answered suggestions are not shown again until new
 * overrides repeat the pattern.
 *
 * - Label: the last three overrides in a label all go the same way, so its
 *   base priority is probably off by one.
 * - Sender: the last three overrides for a sender all go up (suggest VIP) or,
 *   for a VIP, all go down (suggest removing VIP).
 */
export async function getPriorityProposals(
  emailAccountId: string,
): Promise<PriorityProposal[]> {
  const [logs, decisions, categories, contacts] = await Promise.all([
    prisma.categorizePriorityOverrideLog.findMany({
      where: { emailAccountId, manualPriority: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true,
        categoryId: true,
        sender: true,
        computedPriority: true,
        manualPriority: true,
      },
    }),
    prisma.categorizeProposalDecision.findMany({
      where: { emailAccountId },
      select: { key: true },
    }),
    prisma.categorizeCategory.findMany({
      where: { emailAccountId, isActive: true },
      select: { id: true, name: true, basePriority: true },
    }),
    prisma.categorizeContact.findMany({
      where: { emailAccountId },
      select: { email: true, isVip: true },
    }),
  ]);
  const answered = new Set(decisions.map(({ key }) => key));
  const proposals: PriorityProposal[] = [];

  const streak = (group: typeof logs) => {
    const recent = group.slice(0, PROPOSAL_STREAK);
    if (recent.length < PROPOSAL_STREAK) return null;
    const directions = new Set(
      recent.map((log) =>
        (log.manualPriority ?? 0) > log.computedPriority ? "up" : "down",
      ),
    );
    // An override equal to the computed value says nothing either way.
    if (recent.some((log) => log.manualPriority === log.computedPriority)) {
      return null;
    }
    return directions.size === 1
      ? { direction: [...directions][0] as "up" | "down", latest: recent[0] }
      : null;
  };

  for (const category of categories) {
    const result = streak(logs.filter((log) => log.categoryId === category.id));
    if (!result) continue;
    const to = category.basePriority + (result.direction === "up" ? 1 : -1);
    const key = `category:${category.id}:${result.latest.id}`;
    if (to < 1 || to > 5 || answered.has(key)) continue;
    proposals.push({
      key,
      kind: "category_base",
      categoryId: category.id,
      categoryName: category.name,
      from: category.basePriority,
      to,
      direction: result.direction,
    });
  }

  const vipBySender = new Map(
    contacts.map((contact) => [contact.email.toLowerCase(), contact.isVip]),
  );
  const senders = [...new Set(logs.map((log) => log.sender.toLowerCase()))];
  for (const sender of senders) {
    if (!sender) continue;
    const result = streak(
      logs.filter((log) => log.sender.toLowerCase() === sender),
    );
    if (!result) continue;
    const isVip = vipBySender.get(sender) ?? false;
    const makeVip = result.direction === "up";
    if (makeVip === isVip) continue;
    const key = `sender:${sender}:${result.latest.id}`;
    if (answered.has(key)) continue;
    proposals.push({
      key,
      kind: "sender_vip",
      sender,
      makeVip,
      direction: result.direction,
    });
  }

  return proposals;
}
