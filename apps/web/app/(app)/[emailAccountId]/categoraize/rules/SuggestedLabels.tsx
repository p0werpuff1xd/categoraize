"use client";

import { useAction } from "next-safe-action/hooks";
import { SparklesIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ListSkeleton, StateError } from "@/components/CategoraizeStates";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  useCategoraizeCategories,
  useCategoraizeSuggestedLabels,
} from "@/hooks/useCategoraize";
import { useAccount } from "@/providers/EmailAccountProvider";
import { createCategoryFromSuggestionAction } from "@/utils/actions/categoraize";
import { getActionErrorMessage } from "@/utils/error";

/**
 * Labels suggested for Uncategorized emails, from the curated template
 * library only. Shown only when there are suggestions; nothing is created
 * without a click.
 */
export function SuggestedLabels() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useCategoraizeSuggestedLabels();
  const categories = useCategoraizeCategories();
  const create = useAction(
    createCategoryFromSuggestionAction.bind(null, emailAccountId),
    {
      onSuccess: ({ data: result }) => {
        toastSuccess({
          description: `Label created. Re-scored ${result?.rescored ?? 1} Uncategorized email${result?.rescored === 1 ? "" : "s"}.`,
        });
        mutate();
        categories.mutate();
      },
      onError: ({ error: actionError }) =>
        toastError({ description: getActionErrorMessage(actionError) }),
    },
  );

  if (!isLoading && !error && !data?.suggestions.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SparklesIcon className="size-4" aria-hidden />
          Suggested labels
        </CardTitle>
        <CardDescription>
          Some Uncategorized emails fit a common label you don't have yet.
          Labels come from a fixed library and are only created when you click.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? (
          <ListSkeleton rows={2} label="Loading suggestions" />
        ) : error ? (
          <StateError
            title="Couldn't load suggestions"
            error={error}
            onRetry={() => mutate()}
          />
        ) : (
          data?.suggestions.map((suggestion) => (
            <div key={suggestion.key} className="rounded-lg border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-48 flex-1">
                  <div className="font-medium">
                    {suggestion.name}{" "}
                    <span className="text-sm font-normal text-muted-foreground">
                      · {suggestion.count} email
                      {suggestion.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {suggestion.description}
                  </p>
                  {suggestion.examples.length > 0 && (
                    <p className="mt-1 truncate text-xs text-muted-foreground">
                      e.g. {suggestion.examples.join(" · ")}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  loading={create.isExecuting}
                  onClick={() =>
                    create.execute({
                      classificationId: suggestion.classificationId,
                    })
                  }
                >
                  Create "{suggestion.name}"
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
