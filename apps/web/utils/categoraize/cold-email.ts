import { matchDescriptionGroups } from "@/utils/categoraize/multi-match";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import type { EmailForLLM } from "@/utils/types";

export const COLD_EMAIL_THRESHOLD = 0.35;

const COLD = "cold";
const CUSTOM_COLD = "cold-custom";
// Contrast set: the email is cold only if a cold description beats every
// legitimate kind of email, not just because it passes a threshold. Each
// kind has several short descriptions; the best one counts.
const GROUPS = [
  {
    id: COLD,
    descriptions: [
      "A sales pitch from a stranger offering agency, SEO or marketing services",
      "A vendor I don't know asking to show me a demo of their software or platform",
      "Lead generation or outsourcing services offered out of the blue",
      "A templated cold email asking for a quick call to sell me something",
      "Asking if I am the right person to talk to about buying their product",
    ],
  },
  {
    id: "personal",
    descriptions: [
      "A personal email from a friend, family member or classmate",
      "A work email from a colleague or my professor",
      "A reply in an ongoing conversation",
    ],
  },
  {
    id: "introduction",
    descriptions: [
      "An introduction from a mutual contact",
      "Someone I met at an event following up",
    ],
  },
  {
    id: "customer",
    descriptions: [
      "A customer or client asking to buy or order from me, or asking for a quotation",
      "An investor or partner with a concrete, specific opportunity for me",
    ],
  },
  {
    id: "service",
    descriptions: [
      "Account emails from a service I signed up for: welcome, password reset, receipts, alerts",
      "Newsletters and promotions from a store I subscribed to",
    ],
  },
  {
    id: "institution",
    descriptions: [
      "Announcements from my school, office, bank, government agency or building",
    ],
  },
];

export async function semanticIsColdEmail({
  email,
  instructions,
}: {
  email: Pick<EmailForLLM, "subject" | "content">;
  instructions: string | null | undefined;
}): Promise<{ isColdEmail: boolean; aiReason: string }> {
  const custom = instructions?.trim();
  const groups =
    custom && custom !== DEFAULT_COLD_EMAIL_PROMPT.trim()
      ? [...GROUPS, { id: CUSTOM_COLD, descriptions: [custom.slice(0, 2000)] }]
      : GROUPS;

  const { ranked } = await matchDescriptionGroups({
    subject: email.subject,
    body: email.content,
    groups,
  });

  const [best, runnerUp] = ranked;
  const isCold =
    (best.id === COLD || best.id === CUSTOM_COLD) &&
    best.similarity >= COLD_EMAIL_THRESHOLD;

  return {
    isColdEmail: isCold,
    aiReason: `CategorAIze (Sentence-BERT): closest kind of email is "${best.id}" (${best.similarity.toFixed(2)})${
      runnerUp
        ? `, then "${runnerUp.id}" (${runnerUp.similarity.toFixed(2)})`
        : ""
    }; cold needs a cold description first and at least ${COLD_EMAIL_THRESHOLD}.`,
  };
}
