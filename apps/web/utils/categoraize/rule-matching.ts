import { SystemType } from "@/generated/prisma/enums";
import { chooseRuleLocally } from "@/utils/categoraize/client";
import { CONVERSATION_TRACKING_META_RULE_ID } from "@/utils/reply-tracker/conversation-status-config";
import { isDefaultRuleInstructions } from "@/utils/rule/consts";
import type { EmailForLLM } from "@/utils/types";

const MAX_BODY_CHARS = 8000;

/**
 * Local rule matching on the CategorAIze service (Sentence-BERT with several
 * short descriptions per rule; the reply rule competes only when the
 * Bi-LSTM-CRF finds a request or question). Returns a confidence verdict so
 * the caller can escalate unsure emails to the external LLM.
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
}): Promise<{
  rules: { rule: T; isPrimary?: boolean }[];
  reason: string;
  confident: boolean;
}> {
  const result = await chooseRuleLocally({
    subject: email.subject,
    body: email.content.slice(0, MAX_BODY_CHARS),
    rules: rules.map((rule, index) => ({
      id: String(index),
      name: rule.name,
      instructions: rule.instructions ?? "",
      reply_needed: isReplyNeededRule(rule),
      system_type: builtInKind(rule),
    })),
    allowMultiple,
  });

  const nameOf = (id: string) => rules[Number(id)]?.name ?? id;
  const ranked = result.ranked
    .slice(0, 3)
    .map(({ id, similarity }) => `"${nameOf(id)}" ${similarity.toFixed(2)}`)
    .join(", ");
  const threshold = result.params.threshold ?? 0;
  const notes = [
    result.has_request ? "a request or question was found" : null,
    result.confident ? null : `unsure: ${result.reasons.join("; ")}`,
  ]
    .filter(Boolean)
    .join("; ");
  const suffix = notes ? ` (${notes})` : "";

  if (!result.matched.length) {
    return {
      rules: [],
      confident: result.confident,
      reason: `CategorAIze (Sentence-BERT): no rule reached the ${threshold} threshold. Closest: ${ranked}${suffix}.`,
    };
  }

  const [primaryId, ...others] = result.matched;
  return {
    rules: [
      { rule: rules[Number(primaryId)], isPrimary: true },
      ...others.map((id) => ({ rule: rules[Number(id)], isPrimary: false })),
    ],
    confident: result.confident,
    reason: `CategorAIze (Sentence-BERT): matched "${nameOf(primaryId)}" (threshold ${threshold}). Ranked: ${ranked}${suffix}.`,
  };
}

// A built-in rule gets the service's learned centroid and bilingual
// descriptions only while its instructions are the default; once the user
// rewrites them, only their wording counts.
function builtInKind(rule: {
  systemType?: string | null;
  instructions: string;
}) {
  if (!rule.systemType || !isSystemType(rule.systemType)) return null;
  return isDefaultRuleInstructions(rule.systemType, rule.instructions)
    ? rule.systemType
    : null;
}

function isSystemType(value: string): value is SystemType {
  return (Object.values(SystemType) as string[]).includes(value);
}

// With conversation tracking on, the To Reply rule is offered as the
// "Conversations" meta-rule (no systemType), which then decides the status.
function isReplyNeededRule(rule: { id?: string; systemType?: string | null }) {
  return (
    rule.systemType === SystemType.TO_REPLY ||
    rule.id === CONVERSATION_TRACKING_META_RULE_ID
  );
}
