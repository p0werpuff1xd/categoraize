"use client";

import { useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { useLocalStorage } from "usehooks-ts";
import {
  ArrowUpIcon,
  FilterXIcon,
  RefreshCwIcon,
  StarIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { PriorityBadge } from "@/components/CategoraizePriority";
import { Badge } from "@/components/Badge";
import { formatDeadline } from "@/components/CategoraizeSpans";
import {
  ListSkeleton,
  ServiceStatusBanner,
  StateEmpty,
  StateError,
  serviceUnavailableReason,
} from "@/components/CategoraizeStates";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  useCategoraizeCategories,
  useCategoraizeClassifications,
  useCategoraizeLatest,
  useCategoraizeServiceStatus,
} from "@/hooks/useCategoraize";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  classifyRecentCategoraizeEmailsAction,
  reclassifyStoredCategoraizeEmailsAction,
} from "@/utils/actions/categoraize-classification";
import { getActionErrorMessage } from "@/utils/error";
import { cn } from "@/utils";
import type { CategoraizeClassificationsResponse } from "@/app/api/categorai/classifications/route";
import { LOW_CONFIDENCE_SIMILARITY, TriageDetail } from "./TriageDetail";

export type TriageEmail =
  CategoraizeClassificationsResponse["classifications"][number];

const PAGE_SIZE = 25;

type Filter = "all" | "p4plus" | 1 | 2 | 3 | 4 | 5;

export function PriorityInbox() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useCategoraizeClassifications();
  const latest = useCategoraizeLatest();
  const categories = useCategoraizeCategories();
  const service = useCategoraizeServiceStatus();
  const [filter, setFilter] = useState<Filter>("all");
  const [chronological, setChronological] = useLocalStorage(
    "categoraize-triage-chronological",
    false,
    { initializeWithValue: false },
  );
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [openId, setOpenId] = useState<string | null>(null);
  const [recalculatingId, setRecalculatingId] = useState<string | null>(null);

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

  const blockedReason = serviceUnavailableReason(service.data?.status);
  const hasNewMail = Boolean(
    data &&
      latest.data?.latestAnalyzedAt &&
      latest.data.latestAnalyzedAt !== data.latestAnalyzedAt,
  );
  const newCount = Math.max(0, (latest.data?.total ?? 0) - (data?.total ?? 0));
  const allEmails = data?.classifications ?? [];

  const selectFilter = (value: Filter) => {
    setFilter(value);
    setVisible(PAGE_SIZE);
  };

  return (
    <div className="mt-6 space-y-4">
      <ServiceStatusBanner />

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
              onClick={() => selectFilter(chip.value)}
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
            disabled={Boolean(blockedReason)}
            title={blockedReason ?? undefined}
            onClick={() => classifyRecent.execute({ limit: 25 })}
          >
            Classify recent inbox
          </Button>
          <Button
            size="sm"
            variant="outline"
            loading={rescore.isExecuting}
            disabled={Boolean(blockedReason)}
            title={blockedReason ?? undefined}
            onClick={() => rescore.execute({ limit: 200 })}
          >
            <RefreshCwIcon className="mr-1 size-4" />
            Re-score all
          </Button>
        </div>
      </div>
      {blockedReason && (
        <p className="text-xs text-muted-foreground">
          Classify and Re-score are unavailable: {blockedReason.toLowerCase()}.
        </p>
      )}

      {hasNewMail && (
        <div className="flex justify-center">
          <Button
            size="sm"
            className="rounded-full shadow"
            loading={isLoading}
            onClick={() => mutate()}
          >
            <ArrowUpIcon className="mr-1 size-4" />
            {newCount > 0
              ? `${newCount} new ${newCount === 1 ? "email" : "emails"} analyzed. Show`
              : "New mail analyzed. Show"}
          </Button>
        </div>
      )}

      <Card className="divide-y">
        {isLoading ? (
          <ListSkeleton rows={6} label="Loading prioritized emails" />
        ) : error ? (
          <StateError
            title="Couldn't load the Priority Inbox"
            error={error}
            onRetry={() => mutate()}
          />
        ) : allEmails.length === 0 ? (
          <StateEmpty
            title="No analyzed emails yet"
            description={
              blockedReason
                ? "New mail is analyzed once the CategorAIze service is available."
                : 'Use "Classify recent inbox" to analyze your latest emails, or run the seed script for demo data.'
            }
          />
        ) : emails.length === 0 ? (
          <StateEmpty
            title="No emails match this filter"
            description="Nothing is at this priority right now."
            icon={<FilterXIcon />}
            action={
              <Button
                size="sm"
                variant="outline"
                onClick={() => selectFilter("all")}
              >
                Clear filters
              </Button>
            }
          />
        ) : (
          emails.slice(0, visible).map((email) => (
            <div key={email.id}>
              <TriageRow
                email={email}
                open={openId === email.id}
                recalculating={
                  rescore.isExecuting || recalculatingId === email.id
                }
                onToggle={() =>
                  setOpenId((current) =>
                    current === email.id ? null : email.id,
                  )
                }
              />
              {openId === email.id && (
                <TriageDetail
                  email={email}
                  categories={categories.data?.categories ?? []}
                  serviceBlockedReason={blockedReason}
                  onRecalculating={(busy) =>
                    setRecalculatingId(busy ? email.id : null)
                  }
                  onOptimistic={(patch) =>
                    mutate(
                      (current) =>
                        current && {
                          ...current,
                          classifications: current.classifications.map((row) =>
                            row.id === email.id ? { ...row, ...patch } : row,
                          ),
                        },
                      { revalidate: false },
                    )
                  }
                  onChange={() => {
                    mutate();
                    categories.mutate();
                  }}
                />
              )}
            </div>
          ))
        )}
      </Card>

      {emails.length > visible && (
        <div className="flex flex-col items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setVisible((count) => count + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, emails.length - visible)} more
          </Button>
          <span className="text-xs text-muted-foreground">
            Showing {visible} of {emails.length}
          </span>
        </div>
      )}
      {data?.truncated && (
        <p className="text-center text-xs text-muted-foreground">
          Only the 500 most recent analyzed emails are ranked here; the top 200
          are listed.
        </p>
      )}
    </div>
  );
}

function TriageRow({
  email,
  open,
  recalculating,
  onToggle,
}: {
  email: TriageEmail;
  open: boolean;
  recalculating: boolean;
  onToggle: () => void;
}) {
  const suggestion = email.suggestedLabel as { name: string } | null;
  const lowConfidence =
    email.categoryName &&
    !email.isReviewedByUser &&
    email.confidence < LOW_CONFIDENCE_SIMILARITY;
  const vipPinned =
    (email.priorityFactors as { vip_pin?: number } | null)?.vip_pin ?? 0;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        open && "bg-muted/50",
      )}
      aria-expanded={open}
      onClick={onToggle}
    >
      <PriorityBadge
        level={email.priority}
        manual={email.manualPriority !== null}
        vipPinned={vipPinned > 0}
        state={recalculating ? "recalculating" : undefined}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          {email.sender?.isVip && (
            <span className="flex items-center gap-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              <StarIcon className="size-3.5 fill-current" aria-hidden />
              VIP
            </span>
          )}
          <span
            className={cn("truncate text-sm", !email.read && "font-semibold")}
          >
            {email.fromName || email.fromEmail}
          </span>
          {!email.read && <span className="sr-only">Unread</span>}
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
        <div className={cn("truncate text-sm", !email.read && "font-medium")}>
          {email.subject || "(no subject)"}
        </div>
        <div className="truncate text-sm text-muted-foreground">
          {email.snippet}
        </div>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {email.categoryName ? (
            <Badge color="indigo">
              {email.categoryName} · {email.confidence.toFixed(2)}
              {email.corrected
                ? " · corrected"
                : email.isReviewedByUser
                  ? " · confirmed"
                  : ""}
            </Badge>
          ) : (
            <Badge color="gray">
              Uncategorized
              {suggestion ? ` · suggested: ${suggestion.name}` : ""}
            </Badge>
          )}
          {lowConfidence && <Badge color="yellow">Review label</Badge>}
          {email.deadlineAt && (
            <Badge
              color={
                new Date(email.deadlineAt).getTime() < Date.now()
                  ? "red"
                  : "orange"
              }
            >
              {new Date(email.deadlineAt).getTime() < Date.now()
                ? "Overdue: "
                : "Due "}
              {formatDeadline(email.deadlineAt)}
            </Badge>
          )}
          {email.spans.some(
            (span) =>
              span.label === "DATE" && span.ambiguous && !span.confirmed,
          ) && <Badge color="yellow">Date needs review</Badge>}
        </div>
      </div>
    </button>
  );
}
