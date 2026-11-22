"use client";

import type React from "react";
import {
  AlertCircleIcon,
  CloudOffIcon,
  InboxIcon,
  Loader2Icon,
  PowerOffIcon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { useCategoraizeServiceStatus } from "@/hooks/useCategoraize";

export function ListSkeleton({
  rows = 5,
  label = "Loading",
}: {
  rows?: number;
  label?: string;
}) {
  return (
    <div className="space-y-3 p-4" role="status" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-start gap-3">
          <Skeleton className="h-5 w-24" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function StateEmpty({
  title,
  description,
  action,
  icon = <InboxIcon />,
}: {
  title: string;
  description: React.ReactNode;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">{icon}</EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}

export function StateError({
  title = "Couldn't load this",
  error,
  onRetry,
}: {
  title?: string;
  error?: { info?: { error?: unknown }; error?: unknown; message?: string };
  onRetry: () => void;
}) {
  const message =
    stringOrNull(error?.info?.error) ??
    stringOrNull(error?.error) ??
    stringOrNull(error?.message) ??
    "Something went wrong.";
  return (
    <StateEmpty
      title={title}
      description={message}
      icon={<AlertCircleIcon className="text-destructive" />}
      action={
        <Button size="sm" variant="outline" onClick={onRetry}>
          Retry
        </Button>
      }
    />
  );
}

/**
 * Tells the user when smart sorting can't run. Mail still opens either way;
 * only CategorAIze's analysis is paused.
 */
export function ServiceStatusBanner() {
  const { data, mutate, isValidating } = useCategoraizeServiceStatus();
  const status = data?.status;
  if (!status || status === "ready") return null;

  if (status === "loading") {
    return (
      <Alert role="status">
        <Loader2Icon className="size-4 animate-spin" />
        <AlertTitle>The language model is loading</AlertTitle>
        <AlertDescription>
          New mail is analyzed once it is ready, usually within a few minutes.
          Mail still opens normally.
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "disabled") {
    return (
      <Alert role="status">
        <PowerOffIcon className="size-4" />
        <AlertTitle>Smart sorting is turned off</AlertTitle>
        <AlertDescription>
          CATEGORAIZE_ENABLED is off, so new mail is not analyzed. The original
          inbox works as usual; emails already analyzed are shown below.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert role="alert">
      <CloudOffIcon className="size-4" />
      <AlertTitle>Smart sorting is unavailable</AlertTitle>
      <AlertDescription>
        <p>
          The CategorAIze service can't be reached, so new mail isn't labeled or
          prioritized right now. Mail still opens normally, and this page keeps
          retrying.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          loading={isValidating}
          onClick={() => mutate()}
        >
          Retry now
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** Why a service-backed control is disabled, or null when it can run. */
export function serviceUnavailableReason(status: string | undefined) {
  if (status === "disabled") return "Smart sorting is turned off";
  if (status === "loading") return "The language model is still loading";
  if (status === "unavailable") return "The CategorAIze service is unavailable";
  return null;
}

function stringOrNull(value: unknown) {
  return typeof value === "string" && value ? value : null;
}
