"use client";

import { useAction } from "next-safe-action/hooks";
import { CalendarClockIcon, CheckIcon, ListTodoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/Badge";
import { PriorityBadge } from "@/components/CategoraizePriority";
import {
  AddToCalendarLink,
  formatDeadline,
} from "@/components/CategoraizeSpans";
import {
  ListSkeleton,
  StateEmpty,
  StateError,
} from "@/components/CategoraizeStates";
import { toastError, toastSuccess } from "@/components/Toast";
import { useCategoraizeTaskSheet } from "@/hooks/useCategoraize";
import { useAccount } from "@/providers/EmailAccountProvider";
import { dismissCategoraizeSpanAction } from "@/utils/actions/categoraize-deadlines";
import { getActionErrorMessage } from "@/utils/error";
import type { CategoraizeTaskSheetResponse } from "@/app/api/categorai/task-sheet/route";

type Email = CategoraizeTaskSheetResponse["tasks"][number]["classification"];

const SOON_MS = 72 * 60 * 60 * 1000;

/**
 * Smart Task Sheet: upcoming and overdue deadlines, then the open requests
 * found in email. "Done" hides an item; the email itself is not changed.
 */
export function TaskSheet({
  open,
  onOpenChange,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useCategoraizeTaskSheet(open);
  const done = useAction(
    dismissCategoraizeSpanAction.bind(null, emailAccountId),
    {
      onExecute: ({ input }) =>
        mutate(
          (current) =>
            current && {
              tasks: current.tasks.filter((task) => task.id !== input.spanId),
              deadlines: current.deadlines.filter(
                (deadline) => deadline.id !== input.spanId,
              ),
            },
          { revalidate: false },
        ),
      onSuccess: () => {
        toastSuccess({ description: "Marked done" });
        onChange();
      },
      onError: ({ error: actionError }) => {
        mutate();
        toastError({
          title: "Couldn't mark it done, so it was restored",
          description: getActionErrorMessage(actionError),
        });
      },
    },
  );

  const now = Date.now();
  const deadlines = data?.deadlines ?? [];
  const tasks = data?.tasks ?? [];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Task Sheet</SheetTitle>
          <SheetDescription>
            Deadlines and requests CategorAIze found in your email. Marking one
            done only hides it here.
          </SheetDescription>
        </SheetHeader>

        {isLoading ? (
          <ListSkeleton rows={5} label="Loading tasks" />
        ) : error ? (
          <StateError
            title="Couldn't load the Task Sheet"
            error={error}
            onRetry={() => mutate()}
          />
        ) : !deadlines.length && !tasks.length ? (
          <StateEmpty
            title="Nothing to do"
            description="No open requests or upcoming deadlines were found in your analyzed email."
            icon={<ListTodoIcon />}
          />
        ) : (
          <div className="mt-4 space-y-6">
            <section className="space-y-2" aria-labelledby="deadlines-heading">
              <h3
                id="deadlines-heading"
                className="flex items-center gap-1.5 text-sm font-medium"
              >
                <CalendarClockIcon className="size-4" aria-hidden />
                Deadlines ({deadlines.length})
              </h3>
              {!deadlines.length && (
                <p className="text-sm text-muted-foreground">
                  No validated deadlines in the last two weeks or ahead.
                </p>
              )}
              <ul className="space-y-2">
                {deadlines.map((deadline) => {
                  const due = deadline.resolvedAt
                    ? new Date(deadline.resolvedAt).getTime()
                    : null;
                  return (
                    <TaskItem
                      key={deadline.id}
                      email={deadline.classification}
                      text={deadline.text}
                      onDone={() => done.execute({ spanId: deadline.id })}
                      busy={done.isExecuting}
                    >
                      {due !== null && deadline.resolvedAt && (
                        <Badge color={dueColor(due, now)}>
                          {due < now ? "Overdue: " : "Due "}
                          {formatDeadline(deadline.resolvedAt)}
                        </Badge>
                      )}
                      {deadline.confirmed && (
                        <Badge color="green">Confirmed</Badge>
                      )}
                      {deadline.resolvedAt && due !== null && due >= now && (
                        <AddToCalendarLink
                          title={`Deadline: ${deadline.classification.subject || "email request"}`}
                          deadline={deadline.resolvedAt}
                          details={`From ${deadline.classification.fromName || deadline.classification.fromEmail || "an email"}: "${deadline.text}"`}
                        />
                      )}
                    </TaskItem>
                  );
                })}
              </ul>
            </section>

            <section className="space-y-2" aria-labelledby="tasks-heading">
              <h3
                id="tasks-heading"
                className="flex items-center gap-1.5 text-sm font-medium"
              >
                <ListTodoIcon className="size-4" aria-hidden />
                Open requests ({tasks.length})
              </h3>
              {!tasks.length && (
                <p className="text-sm text-muted-foreground">
                  No open requests.
                </p>
              )}
              <ul className="space-y-2">
                {tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    email={task.classification}
                    text={task.text}
                    onDone={() => done.execute({ spanId: task.id })}
                    busy={done.isExecuting}
                  />
                ))}
              </ul>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskItem({
  email,
  text,
  onDone,
  busy,
  children,
}: {
  email: Email;
  text: string;
  onDone: () => void;
  busy: boolean;
  children?: React.ReactNode;
}) {
  return (
    <li className="rounded-md border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">"{text}"</p>
          <p className="truncate text-xs text-muted-foreground">
            {email.fromName || email.fromEmail} ·{" "}
            {email.subject || "(no subject)"}
            {email.categoryName ? ` · ${email.categoryName}` : ""}
          </p>
        </div>
        <PriorityBadge
          level={email.manualPriority ?? email.computedPriority}
          manual={email.manualPriority !== null}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {children}
        <Button
          size="xs"
          variant="outline"
          className="ml-auto"
          disabled={busy}
          onClick={onDone}
        >
          <CheckIcon className="mr-1 size-3" />
          Done
        </Button>
      </div>
    </li>
  );
}

function dueColor(due: number, now: number) {
  if (due < now) return "red" as const;
  if (due - now < SOON_MS) return "orange" as const;
  return "blue" as const;
}
