"use client";

import { useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { GraduationCapIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ListSkeleton, StateError } from "@/components/CategoraizeStates";
import { toastError, toastSuccess } from "@/components/Toast";
import { useCategoraizeClassifications } from "@/hooks/useCategoraize";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  removeCategoraizeLabelExampleAction,
  teachCategoraizeLabelAction,
} from "@/utils/actions/categoraize-classification";
import { getActionErrorMessage } from "@/utils/error";

const MAX_PICK = 50;

/** Newest first; rows without a receipt time sort last. */
function receivedTime(row: { receivedAt?: unknown }) {
  const time = Date.parse(String(row.receivedAt ?? ""));
  return Number.isNaN(time) ? 0 : time;
}

/**
 * Teach a label by example: pick emails that belong in it. They become the
 * label's examples (this account only) and the rest of the inbox is re-sorted.
 */
export function TeachLabelDialog({
  category,
  open,
  onOpenChange,
  onTaught,
}: {
  category: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTaught: () => void;
}) {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useCategoraizeClassifications();
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const rows = data?.classifications ?? [];
  const examples = rows.filter(
    (row) => row.categoryId === category.id && row.isReviewedByUser,
  );
  const candidates = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((row) => !(row.categoryId === category.id && row.isReviewedByUser))
      .filter(
        (row) =>
          !needle ||
          `${row.subject ?? ""} ${row.fromName ?? ""} ${row.fromEmail ?? ""}`
            .toLowerCase()
            .includes(needle),
      )
      .slice()
      .sort((a, b) => receivedTime(b) - receivedTime(a));
  }, [rows, query, category.id]);

  const teach = useAction(teachCategoraizeLabelAction.bind(null, emailAccountId), {
    onSuccess: ({ data: result }) => {
      toastSuccess({
        description: `${category.name} learned from ${result?.examples ?? 0} email${result?.examples === 1 ? "" : "s"}; ${result?.moved ?? 0} other email${result?.moved === 1 ? "" : "s"} re-sorted.`,
      });
      setPicked(new Set());
      mutate();
      onTaught();
      onOpenChange(false);
    },
    onError: ({ error: actionError }) =>
      toastError({ description: getActionErrorMessage(actionError) }),
  });
  const remove = useAction(
    removeCategoraizeLabelExampleAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        mutate();
        onTaught();
      },
      onError: ({ error: actionError }) =>
        toastError({ description: getActionErrorMessage(actionError) }),
    },
  );

  const toggle = (id: string, checked: boolean) =>
    setPicked((current) => {
      const next = new Set(current);
      if (checked && next.size < MAX_PICK) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Teach "{category.name}" by example</DialogTitle>
          <DialogDescription>
            Pick emails that belong in this label. A few good examples (3 to 10)
            teach it much better than a description alone. Examples stay in your
            account and are only used to sort your mail.
          </DialogDescription>
        </DialogHeader>

        {examples.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs font-medium text-muted-foreground">
              Current examples ({examples.length})
            </div>
            <ul className="max-h-28 space-y-1 overflow-y-auto">
              {examples.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-2 rounded border px-2 py-1 text-sm"
                >
                  <span className="truncate">
                    {row.subject || "(no subject)"}
                    <span className="text-muted-foreground">
                      {" "}
                      · {row.fromName || row.fromEmail}
                    </span>
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6 shrink-0"
                    aria-label={`Stop using "${row.subject ?? "email"}" as an example`}
                    loading={remove.isExecuting}
                    onClick={() => remove.execute({ classificationId: row.id })}
                  >
                    <XIcon className="size-3" />
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Input
          placeholder="Filter by subject or sender"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Filter emails"
        />

        {isLoading ? (
          <ListSkeleton rows={5} label="Loading emails" />
        ) : error ? (
          <StateError
            title="Couldn't load your emails"
            error={error}
            onRetry={() => mutate()}
          />
        ) : (
          <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {candidates.map((row) => {
              const checked = picked.has(row.id);
              return (
                <li key={row.id}>
                  <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-muted">
                    <Checkbox
                      className="mt-0.5"
                      checked={checked}
                      disabled={!checked && picked.size >= MAX_PICK}
                      onCheckedChange={(value) => toggle(row.id, value === true)}
                    />
                    <span className="min-w-0 text-sm">
                      <span className="block truncate font-medium">
                        {row.subject || "(no subject)"}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {row.fromName || row.fromEmail} ·{" "}
                        {row.categoryName ?? "Uncategorized"}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
            {candidates.length === 0 && (
              <li className="px-2 py-4 text-center text-sm text-muted-foreground">
                No emails match.
              </li>
            )}
          </ul>
        )}

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <span className="text-xs text-muted-foreground">
            {picked.size} selected
          </span>
          <Button
            disabled={picked.size === 0}
            loading={teach.isExecuting}
            onClick={() =>
              teach.execute({
                categoryId: category.id,
                classificationIds: [...picked],
              })
            }
          >
            <GraduationCapIcon className="mr-1 size-4" />
            Teach {category.name}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
