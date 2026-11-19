"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { LayersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ListSkeleton, StateError } from "@/components/CategoraizeStates";
import { toastError, toastSuccess } from "@/components/Toast";
import { useCategoraizeCategories } from "@/hooks/useCategoraize";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  acceptDiscoveredCategoryAction,
  discoverCategoriesAction,
  dismissDiscoveredCategoriesAction,
} from "@/utils/actions/categoraize";
import type { CategorySuggestion } from "@/utils/categoraize/discovery";
import { getActionErrorMessage } from "@/utils/error";

/**
 * Suggested categories from groups of similar Uncategorized emails. Runs only
 * when asked; the user confirms, renames, merges or dismisses each group, and
 * nothing is created automatically.
 */
export function SuggestedCategories() {
  const { emailAccountId } = useAccount();
  const categories = useCategoraizeCategories();
  const [names, setNames] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const discover = useAction(
    discoverCategoriesAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data }) => {
        setHidden(new Set());
        setSelected(new Set());
        if (data?.status === "ok") {
          setNames(
            Object.fromEntries(
              data.suggestions.map((suggestion) => [
                suggestion.key,
                suggestion.names[0],
              ]),
            ),
          );
        }
      },
    },
  );
  const accept = useAction(
    acceptDiscoveredCategoryAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data, input }) => {
        toastSuccess({
          description: `Category created. Re-scored ${data?.rescored ?? 0} email${data?.rescored === 1 ? "" : "s"}.`,
        });
        hide(input.clusters.map((cluster) => cluster.key));
        categories.mutate();
      },
      onError: ({ error }) =>
        toastError({ description: getActionErrorMessage(error) }),
    },
  );
  const dismiss = useAction(
    dismissDiscoveredCategoriesAction.bind(null, emailAccountId),
    {
      onSuccess: ({ input }) => hide(input.keys),
      onError: ({ error }) =>
        toastError({ description: getActionErrorMessage(error) }),
    },
  );

  function hide(keys: string[]) {
    setHidden((current) => new Set([...current, ...keys]));
    setSelected(
      (current) => new Set([...current].filter((key) => !keys.includes(key))),
    );
  }

  const result = discover.result.data;
  const suggestions =
    result?.status === "ok"
      ? result.suggestions.filter((suggestion) => !hidden.has(suggestion.key))
      : [];
  const busy = accept.isExecuting || dismiss.isExecuting;
  const selectedSuggestions = suggestions.filter((suggestion) =>
    selected.has(suggestion.key),
  );

  function acceptGroups(groups: CategorySuggestion[], name: string) {
    accept.execute({
      name,
      clusters: groups.map((group) => ({
        key: group.key,
        memberIds: group.memberIds,
      })),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LayersIcon className="size-4" aria-hidden />
          Suggested categories
        </CardTitle>
        <CardDescription>
          Groups similar Uncategorized emails into possible new categories. Only
          the emails' vectors are compared, and a category is created only when
          you confirm it.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          variant="outline"
          disabled={discover.isExecuting}
          onClick={() => discover.execute({})}
        >
          {discover.isExecuting
            ? "Looking for groups…"
            : result
              ? "Look again"
              : "Find suggestions"}
        </Button>

        {discover.isExecuting && (
          <ListSkeleton rows={3} label="Grouping your emails" />
        )}

        {discover.hasErrored && (
          <StateError
            title="Couldn't find suggestions"
            error={{ message: getActionErrorMessage(discover.result) }}
            onRetry={() => discover.execute({})}
          />
        )}

        {!discover.isExecuting && result?.status === "not_enough" && (
          <p className="text-sm text-muted-foreground">
            Not enough Uncategorized emails yet: {result.uncategorized} of the{" "}
            {result.needed} needed. Suggestions appear once more emails arrive.
          </p>
        )}

        {!discover.isExecuting &&
          result?.status === "ok" &&
          suggestions.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No groups of similar emails among your {result.uncategorized}{" "}
              Uncategorized emails.
            </p>
          )}

        {selectedSuggestions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm">
            <span>Merge {selectedSuggestions.length} groups into</span>
            <Input
              className="h-8 w-48"
              aria-label="Name for the merged category"
              value={names.merged ?? names[selectedSuggestions[0].key] ?? ""}
              onChange={(event) =>
                setNames({ ...names, merged: event.target.value })
              }
            />
            <Button
              size="sm"
              disabled={
                busy ||
                !(names.merged ?? names[selectedSuggestions[0].key])?.trim()
              }
              onClick={() =>
                acceptGroups(
                  selectedSuggestions,
                  (names.merged ?? names[selectedSuggestions[0].key]).trim(),
                )
              }
            >
              Create merged category
            </Button>
          </div>
        )}

        <ul className="space-y-3">
          {suggestions.map((suggestion) => {
            const name = names[suggestion.key] ?? "";
            return (
              <li
                key={suggestion.key}
                className="space-y-2 rounded-md border p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox
                    aria-label="Select this group to merge"
                    checked={selected.has(suggestion.key)}
                    onCheckedChange={(checked) =>
                      setSelected((current) => {
                        const next = new Set(current);
                        if (checked) next.add(suggestion.key);
                        else next.delete(suggestion.key);
                        return next;
                      })
                    }
                  />
                  <Input
                    className="h-8 w-56"
                    aria-label="Category name"
                    value={name}
                    onChange={(event) =>
                      setNames({
                        ...names,
                        [suggestion.key]: event.target.value,
                      })
                    }
                  />
                  <span className="text-xs text-muted-foreground">
                    {suggestion.size} emails
                  </span>
                  {suggestion.names.length > 1 && (
                    <span className="text-xs text-muted-foreground">
                      Other name:{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() =>
                          setNames({
                            ...names,
                            [suggestion.key]: suggestion.names[1],
                          })
                        }
                      >
                        {suggestion.names[1]}
                      </button>
                    </span>
                  )}
                </div>
                {suggestion.samples.length > 0 && (
                  <ul className="space-y-0.5 pl-6 text-xs text-muted-foreground">
                    {suggestion.samples.map((sample) => (
                      <li key={sample} className="list-disc">
                        {sample}
                      </li>
                    ))}
                  </ul>
                )}
                <div className="flex gap-2 pl-6">
                  <Button
                    size="sm"
                    disabled={busy || !name.trim()}
                    onClick={() => acceptGroups([suggestion], name.trim())}
                  >
                    Create category
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => dismiss.execute({ keys: [suggestion.key] })}
                  >
                    Dismiss
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
