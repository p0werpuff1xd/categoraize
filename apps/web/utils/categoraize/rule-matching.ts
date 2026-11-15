import {
  matchDescriptionGroups,
  ruleDescriptions,
} from "@/utils/categoraize/multi-match";
import type { EmailForLLM } from "@/utils/types";
import { SystemType } from "@/generated/prisma/enums";
import { CONVERSATION_TRACKING_META_RULE_ID } from "@/utils/reply-tracker/conversation-status-config";

// Same starting threshold as label classification (plan section 2).
export const RULE_MATCH_THRESHOLD = 0.35;
// "To Reply" means "someone is asking me for something", which the TASK
// tagger detects directly; similarity to a description alone misses it.
export const TO_REPLY_TASK_BOOST = 0.15;
// With multi-rule selection, a second rule must be this close to the best one.
const SECONDARY_MARGIN = 0.05;

/**
 * Sentence-BERT replacement for the LLM rule selector. Each rule is matched
 * by its best short description (its name and each listed item), and the
 * To Reply rule gets a boost when the Bi-LSTM-CRF finds a request.
 *
 * Limits compared with the LLM: exclusions ("except newsletters") are dropped,
 * and a catch-all rule ("anything that doesn't match the others") has no
 * meaning to match against.
 */
export async function semanticChooseRule<
  T extends {
    id?: string;
    name: string;
    instructions: string;
    systemType?: string | null;
  },
>({
  email,
  rules,
  allowMultiple,
}: {
  email: Pick<EmailForLLM, "subject" | "content">;
  rules: T[];
  allowMultiple: boolean;
}): Promise<{ rules: { rule: T; isPrimary?: boolean }[]; reason: string }> {
  const groups = rules
    .map((rule, index) => ({
      id: String(index),
      descriptions: ruleDescriptions(rule.name, rule.instructions ?? ""),
    }))
    .filter((group) => group.descriptions.length > 0);
  if (!groups.length) {
    return { rules: [], reason: "No rule has instructions to match against" };
  }

  const result = await matchDescriptionGroups({
    subject: email.subject,
    body: email.content,
    groups,
  });
  const ranked = result.ranked
    .map(({ id, similarity }) => {
      const rule = rules[Number(id)];
      const boost =
        result.hasTask && isReplyNeededRule(rule) ? TO_REPLY_TASK_BOOST : 0;
      return { rule, similarity: similarity + boost };
    })
    .sort((a, b) => b.similarity - a.similarity);

  const top = ranked
    .slice(0, 3)
    .map(({ rule, similarity }) => `"${rule.name}" ${similarity.toFixed(2)}`)
    .join(", ");
  const requestNote = result.hasTask
    ? " A request was found in the email."
    : "";
  const [primary, ...rest] = ranked;

  if (!primary || primary.similarity < RULE_MATCH_THRESHOLD) {
    return {
      rules: [],
      reason: `CategorAIze (Sentence-BERT): no rule reached the ${RULE_MATCH_THRESHOLD} similarity threshold. Closest: ${top}.${requestNote}`,
    };
  }

  const secondary = allowMultiple
    ? rest.filter(
        ({ similarity }) =>
          similarity >= RULE_MATCH_THRESHOLD &&
          similarity >= primary.similarity - SECONDARY_MARGIN,
      )
    : [];

  return {
    rules: [
      { rule: primary.rule, isPrimary: true },
      ...secondary.slice(0, 1).map(({ rule }) => ({ rule, isPrimary: false })),
    ],
    reason: `CategorAIze (Sentence-BERT): matched "${primary.rule.name}" with similarity ${primary.similarity.toFixed(2)} (threshold ${RULE_MATCH_THRESHOLD}). Ranked: ${top}.${requestNote}`,
  };
}

// With conversation tracking on, the To Reply rule is offered as the
// "Conversations" meta-rule (no systemType), which then decides the status.
function isReplyNeededRule(rule: { id?: string; systemType?: string | null }) {
  return (
    rule.systemType === SystemType.TO_REPLY ||
    rule.id === CONVERSATION_TRACKING_META_RULE_ID
  );
}
