"use client";

import { useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { RefreshCwIcon, StarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { LoadingContent } from "@/components/LoadingContent";
import { PriorityBadge } from "@/components/CategoraizePriority";
import { Badge } from "@/components/Badge";
import { formatDeadline } from "@/components/CategoraizeSpans";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  useCategoraizeCategories,
  useCategoraizeClassifications,
} from "@/hooks/useCategoraize";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  classifyRecentCategoraizeEmailsAction,
  reclassifyStoredCategoraizeEmailsAction,
} from "@/utils/actions/categoraize-classification";
import { getActionErrorMessage } from "@/utils/error";
import { cn } from "@/utils";
import type { CategoraizeClassificationsResponse } from "@/app/api/categorai/classifications/route";
import { TriageDetail } from "./TriageDetail";

export type TriageEmail =
  CategoraizeClassificationsResponse["classifications"][number];

type Filter = "all" | "p4plus" | 1 | 2 | 3 | 4 | 5;

export function PriorityInbox() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useCategoraizeClassifications();
  const categories = useCategoraizeCategories();
  const [filter, setFilter] = useState<Filter>("all");
  const [chronological, setChronological] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const actionCallbacks = {
    onError: ({
      error,
    }: {
      error: Parameters<typeof getActionErrorMessage>[0];
    }) => toastError({ description: getActionErrorMessage(error) }),
  };
  const classifyRecent = useAction(
    classifyRecentCategoraizeEmailsAction.bind(null, emailAccountId),
    {
      ...actionCallbacks,
      onSuccess: ({ data }) => {
        toastSuccess({
          description: `Classified ${data?.classified ?? 0} recent emails${data?.failed ? `, ${data.failed} failed` : ""}`,
        });
        mutate();
      },
    },
  );
  const rescore = useAction(
    reclassifyStoredCategoraizeEmailsAction.bind(null, emailAccountId),
    {
      ...actionCallbacks,
      onSuccess: ({ data }) => {
        toastSuccess({
          description: `Re-scored ${data?.reclassified ?? 0} emails with the latest label tuning`,
        });
        mutate();
      },
    },
  );

  const emails = useMemo(() => {
    const all = data?.classifications ?? [];
    const filtered = all.filter((email) => {
      if (filter === "all") return true;
      if (filter === "p4plus") return email.priority >= 4;
      return email.priority === filter;
    });
    if (!chronological) return filtered;
    return [...filtered].sort(
      (a, b) =>
        new Date(b.receivedAt ?? 0).getTime() -
        new Date(a.receivedAt ?? 0).getTime(),
    );
  }, [data, filter, chronological]);

  const counts = data?.counts ?? [];
  const unreadAt = (levels: number[]) =>
    counts
      .filter((count) => levels.includes(count.level))
      .reduce((sum, count) => sum + count.unread, 0);
  const totalAt = (levels: number[]) =>
    counts
      .filter((count) => levels.includes(count.level))
      .reduce((sum, count) => sum + count.total, 0);

  const chips: Array<{ value: Filter; label: string; levels: number[] }> = [
    { value: "all", label: "All", levels: [1, 2, 3, 4, 5] },
    { value: "p4plus", label: "P4+", levels: [4, 5] },
    { value: 5, label: "P5", levels: [5] },
    { value: 4, label: "P4", levels: [4] },
    { value: 3, label: "P3", levels: [3] },
    { value: 2, label: "P2", levels: [2] },
    { value: 1, label: "P1", levels: [1] },
  ];

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Filter by priority"
        >
          {chips.map((chip) => (
            <Button
              key={chip.value}
              size="sm"
              variant={filter === chip.value ? "default" : "outline"}
              aria-pressed={filter === chip.value}
              onClick={() => setFilter(chip.value)}
            >
              {chip.label}
              <span className="ml-1.5 text-xs opacity-80">
                {unreadAt(chip.levels)} unread / {totalAt(chip.levels)}
              </span>
            </Button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              id="triage-chronological"
              checked={chronological}
              onCheckedChange={setChronological}
            />
            <Label htmlFor="triage-chronological">Chronological</Label>
          </div>
          <Button
            size="sm"
            variant="outline"
            loading={classifyRecent.isExecuting}
            onClick={() => classifyRecent.execute({ limit: 25 })}
          >
            Classify recent inbox
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={rescore.isExecuting}
            onClick={() => rescore.execute({ limit: 200 })}
          >
            <RefreshCwIcon className="mr-1 size-4" />
            Re-score all
          </Button>
        </div>
      </div>

      <LoadingContent loading={isLoading} error={error}>
        <Card className="divide-y">
          {emails.length === 0 && (
            <p className="p-6 text-sm text-muted-foreground">
              No emails here yet. Use "Classify recent inbox", or run the seed
              script for demo data.
            </p>
          )}
          {emails.map((email) => (
            <div key={email.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50",
                  openId === email.id && "bg-muted/50",
                )}
                aria-expanded={openId === email.id}
                onClick={() =>
                  setOpenId((current) =>
                    current === email.id ? null : email.id,
                  )
                }
              >
                <PriorityBadge
                  level={email.priority}
                  manual={email.manualPriority !== null}
                  className="mt-0.5"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {email.sender?.isVip && (
                      <span className="flex items-center gap-0.5 text-xs font-medium text-amber-600">
                        <StarIcon
                          className="size-3.5 fill-current"
                          aria-hidden
                        />
                        VIP
                      </span>
                    )}
                    <span
                      className={cn(
                        "truncate text-sm",
                        !email.read && "font-semibold",
                      )}
                    >
                      {email.fromName || email.fromEmail}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {email.receivedAt
                        ? new Date(email.receivedAt).toLocaleString("en-PH", {
                            month: "short",
                            day: "numeric",
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : ""}
                    </span>
                  </div>
                  <div
                    className={cn(
                      "truncate text-sm",
                      !email.read && "font-medium",
                    )}
                  >
                    {email.subject || "(no subject)"}
                  </div>
                  <div className="truncate text-sm text-muted-foreground">
                    {email.snippet}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {email.categoryName ? (
                      <Badge color="indigo">
                        {email.categoryName}
                        {email.isReviewedByUser ? " ✓" : ""}
                      </Badge>
                    ) : (
                      <Badge color="gray">Uncategorized</Badge>
                    )}
                    {email.deadlineAt && (
                      <Badge color="red">
                        Due {formatDeadline(email.deadlineAt)}
                      </Badge>
                    )}
                    {email.spans.some(
                      (span) => span.label === "DATE" && span.ambiguous,
                    ) && <Badge color="yellow">Date needs review</Badge>}
                  </div>
                </div>
              </button>
              {openId === email.id && (
                <TriageDetail
                  email={email}
                  categories={categories.data?.categories ?? []}
                  onChange={() => {
                    mutate();
                    categories.mutate();
                  }}
                />
              )}
            </div>
          ))}
        </Card>
      </LoadingContent>
    </div>
  );
}
