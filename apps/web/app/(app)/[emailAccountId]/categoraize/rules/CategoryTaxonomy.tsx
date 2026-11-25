"use client";

import { useState } from "react";
import { useAction } from "next-safe-action/hooks";
import {
  GraduationCapIcon,
  PencilIcon,
  PlusIcon,
  TagsIcon,
  Trash2Icon,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ListSkeleton,
  StateEmpty,
  StateError,
} from "@/components/CategoraizeStates";
import { priorityLabel } from "@/components/CategoraizePriority";
import {
  allowedBasePriorities,
  clampBasePriority,
} from "@/utils/categoraize/category-priority";
import { toastError, toastSuccess } from "@/components/Toast";
import { useCategoraizeCategories } from "@/hooks/useCategoraize";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  createCategoraizeCategoryAction,
  deleteCategoraizeCategoryAction,
  updateCategoraizeCategoryAction,
} from "@/utils/actions/categoraize";
import { getActionErrorMessage } from "@/utils/error";
import type { CategoraizeCategoriesResponse } from "@/app/api/categorai/categories/route";
import { TeachLabelDialog } from "./TeachLabelDialog";

type Category = CategoraizeCategoriesResponse["categories"][number];

export function CategoryTaxonomy() {
  const { data, isLoading, error, mutate } = useCategoraizeCategories();
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle>Labels</CardTitle>
          <CardDescription>
            Base priority is where every email in the label starts before
            deadline, sender and VIP adjustments.
          </CardDescription>
        </div>
        <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
          <PlusIcon className="mr-1 size-4" />
          Add label
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && (
          <CategoryForm
            onDone={() => {
              setAdding(false);
              mutate();
            }}
          />
        )}
        {isLoading ? (
          <ListSkeleton rows={4} label="Loading labels" />
        ) : error ? (
          <StateError
            title="Couldn't load your labels"
            error={error}
            onRetry={() => mutate()}
          />
        ) : (
          <>
            {data?.categories.length === 0 && !adding && (
              <StateEmpty
                title="No labels yet"
                description="Add a label with a short description of the emails that belong in it. Every email is matched against these descriptions."
                icon={<TagsIcon />}
                action={
                  <Button size="sm" onClick={() => setAdding(true)}>
                    <PlusIcon className="mr-1 size-4" />
                    Add label
                  </Button>
                }
              />
            )}
            {data?.categories.map((category) => (
              <CategoryCard
                key={category.id}
                category={category}
                onChange={() => mutate()}
              />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryCard({
  category,
  onChange,
}: {
  category: Category;
  onChange: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [teaching, setTeaching] = useState(false);

  const update = useAction(
    updateCategoraizeCategoryAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: "Label updated" });
        onChange();
      },
      onError: (error) =>
        toastError({ description: getActionErrorMessage(error.error) }),
    },
  );
  const remove = useAction(
    deleteCategoraizeCategoryAction.bind(null, emailAccountId),
    {
      onSuccess: () => onChange(),
      onError: (error) =>
        toastError({ description: getActionErrorMessage(error.error) }),
    },
  );

  if (editing) {
    return (
      <CategoryForm
        category={category}
        onDone={() => {
          setEditing(false);
          onChange();
        }}
      />
    );
  }

  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">{category.name}</div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {category.description || "No description"}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="outline" onClick={() => setTeaching(true)}>
            <GraduationCapIcon className="mr-1 size-4" />
            Teach by example
          </Button>
          <TeachLabelDialog
            category={category}
            open={teaching}
            onOpenChange={setTeaching}
            onTaught={onChange}
          />
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Edit ${category.name}`}
            onClick={() => setEditing(true)}
          >
            <PencilIcon className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Delete ${category.name}`}
            loading={remove.isExecuting}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2Icon className="size-4" />
          </Button>
          <AlertDialog
            open={confirmingDelete}
            onOpenChange={setConfirmingDelete}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete the label "{category.name}"?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Its {category._count.classifications} emails become
                  Uncategorized, and what it learned from your examples is
                  lost. This can't be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => remove.execute({ categoryId: category.id })}
                >
                  Delete label
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span>Base priority</span>
          <Select
            value={String(
              clampBasePriority(category.name, category.basePriority),
            )}
            disabled={update.isExecuting}
            onValueChange={(value) =>
              update.execute({
                categoryId: category.id,
                basePriority: Number(value),
              })
            }
          >
            <SelectTrigger
              className="h-7 w-[150px]"
              aria-label={`Base priority for ${category.name}`}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {allowedBasePriorities(category.name).map((level) => (
                <SelectItem key={level} value={String(level)}>
                  P{level} · {priorityLabel(level)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span>
          {category._count.classifications} emails ·{" "}
          {category.exampleCount === 0
            ? "no examples yet: teach it with a few emails"
            : `learned from ${category.exampleCount} example${category.exampleCount === 1 ? "" : "s"}`}
        </span>
      </div>
    </div>
  );
}

function CategoryForm({
  category,
  onDone,
}: {
  category?: Category;
  onDone: () => void;
}) {
  const { emailAccountId } = useAccount();
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [basePriority, setBasePriority] = useState(category?.basePriority ?? 3);

  const callbacks = {
    onSuccess: ({ data }: { data?: { embedded?: boolean } }) => {
      toastSuccess({
        description:
          data?.embedded === false
            ? "Saved. The NLP service was unreachable, so the description will be embedded on the next classification."
            : "Saved",
      });
      onDone();
    },
    onError: ({
      error,
    }: {
      error: Parameters<typeof getActionErrorMessage>[0];
    }) => toastError({ description: getActionErrorMessage(error) }),
  };
  const create = useAction(
    createCategoraizeCategoryAction.bind(null, emailAccountId),
    callbacks,
  );
  const update = useAction(
    updateCategoraizeCategoryAction.bind(null, emailAccountId),
    callbacks,
  );
  const isExecuting = create.isExecuting || update.isExecuting;

  return (
    <form
      className="space-y-3 rounded-lg border border-dashed p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (category) {
          update.execute({
            categoryId: category.id,
            name,
            description,
            basePriority,
          });
        } else {
          create.execute({ name, description, basePriority });
        }
      }}
    >
      <div className="space-y-1">
        <Label htmlFor="categoraize-label-name">Name</Label>
        <Input
          id="categoraize-label-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. School"
          required
          maxLength={100}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="categoraize-label-description">Description</Label>
        <Textarea
          id="categoraize-label-description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="What kind of emails belong here? e.g. University coursework: classes, assignments, exams, grades and professors."
          rows={3}
          maxLength={2000}
        />
        {category && (
          <p className="text-xs text-muted-foreground">
            Changing the name or description restarts the label's learned tuning
            from the new description.
          </p>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Label>Base priority</Label>
        <Select
          value={String(clampBasePriority(name, basePriority))}
          onValueChange={(value) => setBasePriority(Number(value))}
        >
          <SelectTrigger className="h-8 w-[150px]" aria-label="Base priority">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {allowedBasePriorities(name).map((level) => (
              <SelectItem key={level} value={String(level)}>
                P{level} · {priorityLabel(level)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={isExecuting}>
          {category ? "Save" : "Add label"}
        </Button>
      </div>
    </form>
  );
}
