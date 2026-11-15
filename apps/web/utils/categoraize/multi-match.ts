import { matchEmail } from "@/utils/categoraize/client";

const MAX_BODY_CHARS = 8000;
const MAX_CANDIDATES = 200;

/**
 * Zero-shot match against groups of short descriptions. A group scores the
 * similarity of its best description (multi-prototype matching): one long
 * description blurs several ideas into one vector, while "one-time passwords",
 * "2FA codes" and "verification codes" each match their own kind of email.
 */
export async function matchDescriptionGroups({
  subject,
  body,
  groups,
}: {
  subject: string;
  body: string;
  groups: Array<{ id: string; descriptions: string[] }>;
}) {
  const candidates = groups
    .flatMap((group) =>
      group.descriptions.map((text, index) => ({
        id: `${group.id}::${index}`,
        text,
      })),
    )
    .slice(0, MAX_CANDIDATES);

  const result = await matchEmail({
    subject,
    body: body.slice(0, MAX_BODY_CHARS),
    candidates,
    threshold: -1,
  });

  const bestByGroup = new Map<string, number>();
  for (const match of result.ranked) {
    const groupId = match.id.split("::")[0];
    bestByGroup.set(
      groupId,
      Math.max(bestByGroup.get(groupId) ?? -1, match.similarity),
    );
  }

  return {
    ranked: [...bestByGroup.entries()]
      .map(([id, similarity]) => ({ id, similarity }))
      .sort((a, b) => b.similarity - a.similarity),
    hasTask: result.has_task,
  };
}
