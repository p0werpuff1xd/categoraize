"use client";

import { useAction } from "next-safe-action/hooks";
import { LightbulbIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { priorityLabel } from "@/components/CategoraizePriority";
import { toastError, toastSuccess } from "@/components/Toast";
import { useCategoraizeProposals } from "@/hooks/useCategoraize";
import { useAccount } from "@/providers/EmailAccountProvider";
import { answerPriorityProposalAction } from "@/utils/actions/categoraize-feedback";
import { getActionErrorMessage } from "@/utils/error";
import type { CategoraizeProposalsResponse } from "@/app/api/categorai/proposals/route";

type Proposal = CategoraizeProposalsResponse["proposals"][number];

/**
 * Suggestions from repeated manual overrides (plan section 7). Nothing
 * changes until the user accepts; either answer hides the suggestion.
 */
export function PrioritySuggestions({ onChange }: { onChange: () => void }) {
  const { emailAccountId } = useAccount();
  const { data, mutate } = useCategoraizeProposals();
  const answer = useAction(
    answerPriorityProposalAction.bind(null, emailAccountId),
    {
      onExecute: ({ input }) =>
        mutate(
          (current) =>
            current && {
              proposals: current.proposals.filter(
                (proposal) => proposal.key !== input.key,
              ),
            },
          { revalidate: false },
        ),
      onSuccess: ({ data: result }) => {
        toastSuccess({
          description: result?.accepted
            ? `Applied. Re-scored ${result.rescored} email${result.rescored === 1 ? "" : "s"}.`
            : "Okay, I won't suggest that again for now.",
        });
        mutate();
        onChange();
      },
      onError: ({ error }) => {
        mutate();
        toastError({ description: getActionErrorMessage(error) });
      },
    },
  );

  const proposals = data?.proposals ?? [];
  if (!proposals.length) return null;

  return (
    <section className="space-y-2" aria-label="Priority suggestions">
      {proposals.map((proposal) => (
        <Alert key={proposal.key}>
          <LightbulbIcon className="size-4" />
          <AlertTitle>{title(proposal)}</AlertTitle>
          <AlertDescription>
            <p>{explanation(proposal)}</p>
            <div className="mt-2 flex gap-2">
              <Button
                size="sm"
                disabled={answer.isExecuting}
                onClick={() =>
                  answer.execute({ key: proposal.key, accept: true })
                }
              >
                {acceptLabel(proposal)}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={answer.isExecuting}
                onClick={() =>
                  answer.execute({ key: proposal.key, accept: false })
                }
              >
                Not now
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ))}
    </section>
  );
}

function title(proposal: Proposal) {
  if (proposal.kind === "category_base") {
    return `${proposal.direction === "up" ? "Raise" : "Lower"} "${proposal.categoryName}" to P${proposal.to}?`;
  }
  return proposal.makeVip
    ? `Make ${proposal.sender} a VIP?`
    : `Remove VIP from ${proposal.sender}?`;
}

function explanation(proposal: Proposal) {
  if (proposal.kind === "category_base") {
    return `Your last 3 manual changes in this label all set the priority ${proposal.direction === "up" ? "higher" : "lower"} than computed. Its base priority would go from P${proposal.from} · ${priorityLabel(proposal.from)} to P${proposal.to} · ${priorityLabel(proposal.to)}, and its emails would be re-scored.`;
  }
  return proposal.makeVip
    ? "You raised this sender's priority the last 3 times. As a VIP their emails are at least P4. You can also set a role in Contacts."
    : "You lowered this VIP sender's priority the last 3 times. Without VIP their emails follow the normal rules.";
}

function acceptLabel(proposal: Proposal) {
  if (proposal.kind === "category_base") return `Set to P${proposal.to}`;
  return proposal.makeVip ? "Make VIP" : "Remove VIP";
}
