"use client";

import { useMemo, useState } from "react";
import { useAction } from "next-safe-action/hooks";
import { StarIcon, UserPlusIcon, UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
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
import { toastError, toastSuccess } from "@/components/Toast";
import { useCategoraizeContacts } from "@/hooks/useCategoraize";
import { useAccount } from "@/providers/EmailAccountProvider";
import { upsertCategoraizeContactAction } from "@/utils/actions/categoraize";
import { getActionErrorMessage } from "@/utils/error";
import type { CategoraizeContactsResponse } from "@/app/api/categorai/contacts/route";

type Contact = CategoraizeContactsResponse["contacts"][number];
type Role = NonNullable<Contact["role"]>;

const ROLE_OPTIONS: Array<{ value: Role | "none"; label: string }> = [
  { value: "none", label: "No role" },
  { value: "DIRECTOR_EXECUTIVE", label: "Director/Executive (+2)" },
  { value: "MANAGER", label: "Manager (+1)" },
  { value: "DIRECT_REPORT", label: "Direct report" },
  { value: "EXTERNAL_VENDOR", label: "External vendor" },
];

const PAGE_SIZE = 50;

export function ContactsTable() {
  const { emailAccountId } = useAccount();
  const { data, isLoading, error, mutate } = useCategoraizeContacts();
  const [filter, setFilter] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const save = useAction(
    upsertCategoraizeContactAction.bind(null, emailAccountId),
    {
      onExecute: ({ input }) =>
        mutate(
          (current) =>
            current && {
              contacts: upsertRow(current.contacts, input),
            },
          { revalidate: false },
        ),
      onSuccess: ({ data: result }) => {
        toastSuccess({
          description: result?.rescored
            ? `Saved. Re-scored ${result.rescored} email${result.rescored === 1 ? "" : "s"} from this sender.`
            : "Saved",
        });
        mutate();
      },
      onError: ({ error: actionError }) => {
        mutate();
        toastError({
          title: "Couldn't save, so the change was undone",
          description: getActionErrorMessage(actionError),
        });
      },
    },
  );

  const contacts = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const all = data?.contacts ?? [];
    return needle
      ? all.filter(
          (contact) =>
            contact.email.includes(needle) ||
            contact.name?.toLowerCase().includes(needle),
        )
      : all;
  }, [data, filter]);

  const update = (
    contact: Contact,
    changes: Partial<Pick<Contact, "role" | "isVip">>,
  ) =>
    save.execute({
      email: contact.email,
      name: contact.name ?? undefined,
      role: changes.role !== undefined ? changes.role : contact.role,
      isVip: changes.isVip ?? contact.isVip,
    });

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Input
          aria-label="Filter contacts"
          placeholder="Filter by name or email"
          className="max-w-xs"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value);
            setVisible(PAGE_SIZE);
          }}
        />
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const email = newEmail.trim().toLowerCase();
            if (!email) return;
            save.execute({ email, role: null, isVip: false });
            setNewEmail("");
          }}
        >
          <Input
            type="email"
            aria-label="Add a contact by email"
            placeholder="name@example.com"
            className="w-56"
            value={newEmail}
            onChange={(event) => setNewEmail(event.target.value)}
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={!newEmail.trim()}
          >
            <UserPlusIcon className="mr-1 size-4" />
            Add contact
          </Button>
        </form>
      </div>

      <Card className="divide-y">
        {isLoading ? (
          <ListSkeleton rows={6} label="Loading contacts" />
        ) : error ? (
          <StateError
            title="Couldn't load contacts"
            error={error}
            onRetry={() => mutate()}
          />
        ) : !contacts.length ? (
          <StateEmpty
            title={filter ? "No contacts match this filter" : "No contacts yet"}
            description={
              filter
                ? "Try another name or email."
                : "Senders appear here once their emails are analyzed. You can also add one by email above."
            }
            icon={<UsersIcon />}
          />
        ) : (
          contacts.slice(0, visible).map((contact) => (
            <div
              key={contact.email}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {contact.isVip && (
                    <span className="flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400">
                      <StarIcon className="size-3.5 fill-current" aria-hidden />
                      VIP
                    </span>
                  )}
                  <span className="truncate">
                    {contact.name || contact.email}
                  </span>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {contact.name ? `${contact.email} · ` : ""}
                  {contact.emails} analyzed email
                  {contact.emails === 1 ? "" : "s"}
                </div>
              </div>
              <Select
                value={contact.role ?? "none"}
                disabled={save.isExecuting}
                onValueChange={(value) =>
                  update(contact, {
                    role: value === "none" ? null : (value as Role),
                  })
                }
              >
                <SelectTrigger
                  className="h-8 w-[200px]"
                  aria-label={`Role for ${contact.email}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Switch
                  id={`vip-${contact.email}`}
                  checked={contact.isVip}
                  aria-label={`VIP: ${contact.name || contact.email}`}
                  disabled={save.isExecuting}
                  onCheckedChange={(isVip) => update(contact, { isVip })}
                />
                <label htmlFor={`vip-${contact.email}`} className="text-sm">
                  VIP
                </label>
              </div>
            </div>
          ))
        )}
      </Card>

      {contacts.length > visible && (
        <div className="flex justify-center">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setVisible((count) => count + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, contacts.length - visible)} more
          </Button>
        </div>
      )}
    </div>
  );
}

function upsertRow(
  rows: Contact[],
  input: { email: string; role?: Role | null; isVip: boolean; name?: string },
) {
  const exists = rows.some((row) => row.email === input.email);
  if (!exists) {
    return [
      {
        email: input.email,
        name: input.name ?? null,
        role: input.role ?? null,
        isVip: input.isVip,
        saved: true,
        emails: 0,
        lastReceivedAt: null,
      },
      ...rows,
    ];
  }
  return rows.map((row) =>
    row.email === input.email
      ? { ...row, role: input.role ?? null, isVip: input.isVip, saved: true }
      : row,
  );
}
