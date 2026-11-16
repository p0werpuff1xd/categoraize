"use client";

import { ShieldCheckIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import {
  ListSkeleton,
  StateEmpty,
  StateError,
} from "@/components/CategoraizeStates";
import { useAuditEvents } from "@/hooks/useCategoraize";

const EVENT_LABELS: Record<string, string> = {
  login: "Signed in",
  logout: "Signed out",
  account_connected: "Account connected",
  account_disconnected: "Account disconnected",
  consent_accepted: "Accepted the Terms and Privacy Notice",
  consent_withdrawn: "Withdrew consent",
  external_llm_toggled: "Changed external AI processing",
  oauth_scope_changed: "Granted access (calendar or files)",
  export_requested: "Requested a data download",
  data_deletion_requested: "Requested account deletion",
  data_deletion_completed: "Account data deleted",
};

export function SecurityLog() {
  const { data, isLoading, error, mutate } = useAuditEvents();

  return (
    <Card className="mt-6 divide-y">
      {isLoading ? (
        <ListSkeleton rows={6} label="Loading security log" />
      ) : error ? (
        <StateError
          title="Couldn't load the security log"
          error={error}
          onRetry={() => mutate()}
        />
      ) : !data?.events.length ? (
        <StateEmpty
          title="No events yet"
          description="Sign-ins, connected accounts and consent changes will appear here."
          icon={<ShieldCheckIcon />}
        />
      ) : (
        data.events.map((event) => (
          <div
            key={event.id}
            className="flex flex-wrap items-baseline justify-between gap-2 px-4 py-3 text-sm"
          >
            <div className="min-w-0">
              <div className="font-medium">
                {EVENT_LABELS[event.eventType] ?? event.eventType}
              </div>
              <div className="truncate text-xs text-muted-foreground">
                {describe(event.metadata, event.account)}
              </div>
            </div>
            <time
              dateTime={String(event.createdAt)}
              className="text-xs text-muted-foreground"
            >
              {new Date(event.createdAt).toLocaleString()}
            </time>
          </div>
        ))
      )}
    </Card>
  );
}

function describe(metadata: unknown, account: string | null) {
  const parts: string[] = [];
  if (account) parts.push(account);
  if (metadata && typeof metadata === "object") {
    for (const [key, value] of Object.entries(metadata)) {
      if (value === null || value === undefined) continue;
      parts.push(`${key}: ${String(value)}`);
    }
  }
  return parts.join(" · ") || "No details";
}
