"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react";
import {
  type CategoraizePriorityFactors,
  PriorityBadge,
  PriorityFactorBreakdown,
  deadlineStateFromSpans,
  priorityLabel,
} from "@/components/CategoraizePriority";
import {
  AddToCalendarLink,
  DeadlineStatus,
  HighlightedText,
  SpanLegend,
  formatDeadline,
} from "@/components/CategoraizeSpans";
import { toastError, toastSuccess } from "@/components/Toast";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  acceptCategoraizeCategoryAction,
  correctCategoraizeCategoryAction,
  rateCategoraizePriorityAction,
  setCategoraizeManualPriorityAction,
} from "@/utils/actions/categoraize-classification";
import { createCategoryFromSuggestionAction } from "@/utils/actions/categoraize";
import {
  confirmCategoraizeDeadlineAction,
  dismissCategoraizeSpanAction,
} from "@/utils/actions/categoraize-deadlines";
import { getActionErrorMessage } from "@/utils/error";
import {
  canRate,
  initialRating,
  type RatingState,
  ratingReducer,
} from "@/utils/categoraize/rating-state";
import type { CategoraizeCategoriesResponse } from "@/app/api/categorai/categories/route";
import type { TriageEmail } from "./PriorityInbox";

type Category = CategoraizeCategoriesResponse["categories"][number];

/** Matches between the 0.35 threshold and this get a "Review" cue. */
export const LOW_CONFIDENCE_SIMILARITY = 0.45;

export function TriageDetail({
  email,
  categories,
  calendarConnected,
  serviceBlockedReason,
  onChange,
  onOptimistic,
  onRecalculating,
}: {
  email: TriageEmail;
  categories: Category[];
  calendarConnected: boolean;
  serviceBlockedReason: string | null;
  onChange: () => void;
  onOptimistic: (patch: Partial<TriageEmail>) => void;
  onRecalculating: (busy: boolean) => void;
}) {
  const { emailAccountId } = useAccount();
  const [targetCategoryId, setTargetCategoryId] = useState<string>("");
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [rating, setRating] = useState<RatingState>(initialRating);

  const callbacks = (success: string) => ({
    onSuccess: () => {
      toastSuccess({ description: success });
      onChange();
    },
    onError: ({
      error,
    }: {
      error: Parameters<typeof getActionErrorMessage>[0];
    }) => toastError({ description: getActionErrorMessage(error) }),
  });
  // Optimistic changes are undone by refetching the saved state.
  const rollbackOnError = ({
    error,
  }: {
    error: Parameters<typeof getActionErrorMessage>[0];
  }) => {
    onChange();
    toastError({
      title: "Couldn't save, so the change was undone",
      description: getActionErrorMessage(error),
    });
  };

  const accept = useAction(
    acceptCategoraizeCategoryAction.bind(null, emailAccountId),
    {
      ...callbacks("Label accepted"),
      onExecute: () => onOptimistic({ isReviewedByUser: true }),
      onError: rollbackOnError,
    },
  );
  const correct = useAction(
    correctCategoraizeCategoryAction.bind(null, emailAccountId),
    {
      onExecute: ({ input }) => {
        onRecalculating(true);
        onOptimistic({
          categoryId: input.categoryId,
          categoryName:
            categories.find(({ id }) => id === input.categoryId)?.name ??
            email.categoryName,
          isReviewedByUser: true,
          corrected: true,
        });
      },
      onSuccess: () => {
        setTargetCategoryId("");
        toastSuccess({
          description: "Label corrected. The labels' centroids were updated.",
        });
        onChange();
      },
      onError: rollbackOnError,
      onSettled: () => onRecalculating(false),
    },
  );
  const override = useAction(
    setCategoraizeManualPriorityAction.bind(null, emailAccountId),
    {
      onExecute: ({ input }) =>
        onOptimistic({
          manualPriority: input.priority,
          priority: input.priority ?? email.computedPriority,
        }),
      onSuccess: () => {
        setOverrideOpen(false);
        toastSuccess({ description: "Priority updated" });
        onChange();
      },
      onError: rollbackOnError,
    },
  );
  const rate = useAction(
    rateCategoraizePriorityAction.bind(null, emailAccountId),
    {
      onExecute: ({ input }) => {
        if (!input.accurate) setOverrideOpen(true);
      },
      onSuccess: () => {
        setRating((state) => ratingReducer(state, { type: "success" }));
        toastSuccess({ description: "Thanks, rating saved" });
      },
      onError: ({ error }) => {
        setRating((state) => ratingReducer(state, { type: "error" }));
        toastError({
          title: "Couldn't save the rating",
          description: getActionErrorMessage(error),
        });
      },
    },
  );
  const submitRating = (accurate: boolean) => {
    const next = ratingReducer(rating, {
      type: "click",
      accurate,
      online: typeof navigator === "undefined" || navigator.onLine,
    });
    setRating(next);
    if (next.status === "offline") {
      toastError({
        title: "You're offline",
        description:
          "The rating was not sent. Try again when you're back online.",
      });
      return;
    }
    if (next.status === "saving") {
      rate.execute({ classificationId: email.id, accurate });
    }
  };
  const createFromSuggestion = useAction(
    createCategoryFromSuggestionAction.bind(null, emailAccountId),
    callbacks("Label created"),
  );
  const confirmDeadline = useAction(
    confirmCategoraizeDeadlineAction.bind(null, emailAccountId),
    callbacks("Deadline confirmed"),
  );
  const dismissSpan = useAction(
    dismissCategoraizeSpanAction.bind(null, emailAccountId),
    callbacks("Dismissed"),
  );

  const suggestion = email.suggestedLabel as {
    name: string;
    similarity: number;
  } | null;
  const ranked = (email.rankedCategories ?? []) as Array<{
    id: string;
    similarity: number;
  }>;
  const nameById = new Map(categories.map(({ id, name }) => [id, name]));
  const factors = email.priorityFactors as CategoraizePriorityFactors | null;
  const dates = email.spans.filter((span) => span.label === "DATE");
  const correctDisabledReason = serviceBlockedReason
    ? serviceBlockedReason
    : targetCategoryId
      ? null
      : "Pick a label first";

  return (
    <div className="grid gap-6 border-t bg-muted/20 px-4 py-4 lg:grid-cols-2">
      <div className="space-y-4">
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Email</h3>
            <SpanLegend />
          </div>
          {email.subject && (
            <HighlightedText
              text={email.subject}
              spans={email.spans.filter((span) => span.source === "subject")}
              className="font-medium"
            />
          )}
          <HighlightedText
            text={email.bodyText ?? email.snippet ?? ""}
            spans={
              email.bodyText
                ? email.spans.filter((span) => span.source === "body")
                : []
            }
          />
          {email.piiMaskedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {email.piiMaskedCount} personal number
              {email.piiMaskedCount === 1 ? " was" : "s were"} masked before
              analysis ([PHONE], [CARD], [GOV_ID]).
            </p>
          )}
          {email.senderRegister && (
            <p className="text-xs text-muted-foreground">
              Sender tone:{" "}
              <span className="font-medium text-foreground">
                {email.senderRegister}
              </span>
            </p>
          )}
        </section>

        {dates.length > 0 && (
          <section className="space-y-2">
            <h3 className="text-sm font-medium">Dates</h3>
            <ul className="space-y-2 text-sm">
              {dates.map((span) => (
                <li key={span.id} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">"{span.text}"</span>
                  <span>
                    →{" "}
                    {span.resolvedAt
                      ? formatDeadline(span.resolvedAt)
                      : "could not resolve"}
                  </span>
                  <DeadlineStatus
                    ambiguous={span.ambiguous}
                    confirmed={span.confirmed}
                    isDeadline={span.isDeadline}
                    resolvedAt={span.resolvedAt}
                  />
                  {span.resolvedAt && (span.isDeadline || span.confirmed) && (
                    <AddToCalendarLink
                      title={`Deadline: ${email.subject || "email request"}`}
                      deadline={span.resolvedAt}
                      details={`From ${email.fromName || email.fromEmail || "an email"}: "${span.text}"`}
                    />
                  )}
                  {!span.confirmed && span.resolvedAt && (
                    <Button
                      size="xs"
                      variant="outline"
                      loading={confirmDeadline.isExecuting}
                      onClick={() =>
                        confirmDeadline.execute({ spanId: span.id })
                      }
                    >
                      Confirm deadline
                    </Button>
                  )}
                  <Button
                    size="xs"
                    variant="ghost"
                    loading={dismissSpan.isExecuting}
                    onClick={() => dismissSpan.execute({ spanId: span.id })}
                  >
                    Not a deadline
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="space-y-5">
        <section className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">Why this priority</h3>
            <div
              className="flex items-center gap-1.5 text-xs"
              role="group"
              aria-label="Rate this priority"
            >
              <PriorityBadge
                level={email.priority}
                manual={email.manualPriority !== null}
              />
              {canRate(rating) ? (
                <>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={rate.isExecuting}
                    onClick={() => submitRating(true)}
                  >
                    <ThumbsUpIcon className="mr-1 size-3" />
                    Accurate
                  </Button>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={rate.isExecuting}
                    onClick={() => submitRating(false)}
                  >
                    <ThumbsDownIcon className="mr-1 size-3" />
                    Not accurate
                  </Button>
                </>
              ) : (
                <span className="text-muted-foreground">
                  Rated {rating.rated ? "accurate" : "not accurate"}
                </span>
              )}
            </div>
          </div>
          {factors ? (
            <PriorityFactorBreakdown
              factors={factors}
              level={email.priority}
              computedLevel={email.computedPriority}
              deadlineState={deadlineStateFromSpans(email.spans)}
              calendarConnected={calendarConnected}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No breakdown stored for this email. Re-score it to compute one.
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Select
              open={overrideOpen}
              onOpenChange={setOverrideOpen}
              disabled={override.isExecuting}
              value={email.manualPriority ? String(email.manualPriority) : ""}
              onValueChange={(value) =>
                override.execute({
                  classificationId: email.id,
                  priority: Number(value),
                })
              }
            >
              <SelectTrigger
                className="h-8 w-[170px]"
                aria-label="Override priority"
              >
                <SelectValue placeholder="Override priority" />
              </SelectTrigger>
              <SelectContent>
                {[5, 4, 3, 2, 1].map((level) => (
                  <SelectItem key={level} value={String(level)}>
                    P{level} · {priorityLabel(level)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {email.manualPriority !== null && (
              <Button
                size="sm"
                variant="ghost"
                loading={override.isExecuting}
                onClick={() =>
                  override.execute({
                    classificationId: email.id,
                    priority: null,
                  })
                }
              >
                Reset to computed P{email.computedPriority}
              </Button>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Label</h3>
          <p className="text-sm">
            {email.categoryName ? (
              <>
                <b>{email.categoryName}</b> ({email.confidence.toFixed(2)}{" "}
                similarity)
                {email.corrected
                  ? " · corrected by you"
                  : email.isReviewedByUser
                    ? " · confirmed"
                    : ""}
              </>
            ) : (
              "Uncategorized: no label passed the similarity threshold."
            )}
          </p>
          {email.categoryName &&
            !email.isReviewedByUser &&
            email.confidence < LOW_CONFIDENCE_SIMILARITY && (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Low confidence: this barely passed the threshold. Accept it or
                move it to the right label.
              </p>
            )}

          {!email.categoryName && suggestion && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-sm">
              <span>
                Suggested new label: <b>{suggestion.name}</b> (
                {suggestion.similarity.toFixed(2)})
              </span>
              <Button
                size="xs"
                loading={createFromSuggestion.isExecuting}
                onClick={() =>
                  createFromSuggestion.execute({ classificationId: email.id })
                }
              >
                Create "{suggestion.name}"
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {email.categoryName && !email.isReviewedByUser && (
              <Button
                size="sm"
                variant="outline"
                loading={accept.isExecuting}
                onClick={() => accept.execute({ classificationId: email.id })}
              >
                Accept label
              </Button>
            )}
            <Select
              value={targetCategoryId}
              onValueChange={setTargetCategoryId}
            >
              <SelectTrigger
                className="h-8 w-[200px]"
                aria-label="Move to label"
              >
                <SelectValue placeholder="Move to label…" />
              </SelectTrigger>
              <SelectContent>
                {categories
                  .filter((category) => category.id !== email.categoryId)
                  .map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={Boolean(correctDisabledReason)}
              title={correctDisabledReason ?? undefined}
              loading={correct.isExecuting}
              onClick={() =>
                correct.execute({
                  classificationId: email.id,
                  categoryId: targetCategoryId,
                })
              }
            >
              Correct label
            </Button>
          </div>
          {correctDisabledReason && targetCategoryId && (
            <p className="text-xs text-muted-foreground">
              Can't correct right now. {correctDisabledReason}.
            </p>
          )}

          {ranked.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">
                Similarity to every label
              </summary>
              <ul className="mt-1 space-y-0.5">
                {ranked.map((item) => (
                  <li key={item.id} className="flex justify-between gap-2">
                    <span>{nameById.get(item.id) ?? "(deleted label)"}</span>
                    <span className="font-mono tabular-nums">
                      {item.similarity.toFixed(3)}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>
    </div>
  );
}
