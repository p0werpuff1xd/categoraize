"use client";

import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { XIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import useSWR from "swr";
import type { ContactsResponse } from "@/app/api/user/contacts/route";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { env } from "@/env";
import { cn } from "@/utils";
import {
  extractEmailAddress,
  extractNameFromEmail,
  splitRecipientList,
} from "@/utils/email";
import {
  type ComposeRecipientField,
  isValidComposeRecipientList,
  resolveComposeRecipients,
  resolveRecipientSelection,
} from "./compose-recipients";
import {
  mergeContactSuggestions,
  useLocalContactSuggestions,
} from "./contact-suggestions";

const RECIPIENT_LABELS: Record<ComposeRecipientField, MessageDescriptor> = {
  to: msg`To`,
  cc: msg`Cc`,
  bcc: msg`Bcc`,
};

export function ComposeContactRecipientField({
  active,
  autoFocus,
  className,
  emailAccountId,
  ownAddresses,
  isReconnectingContacts,
  name,
  onActivate,
  onReconnectContacts,
  onReconnectRequired,
  onSearchQueryChange,
  onSelectedRecipientsChange,
  reconnectRequired,
  selectedRecipients,
}: {
  active: boolean;
  autoFocus?: boolean;
  className?: string;
  emailAccountId: string;
  ownAddresses: string[];
  isReconnectingContacts: boolean;
  name: ComposeRecipientField;
  onActivate: (field: ComposeRecipientField) => void;
  onReconnectContacts: () => void;
  onReconnectRequired: () => void;
  onSearchQueryChange: (field: ComposeRecipientField, query: string) => void;
  onSelectedRecipientsChange: (
    field: ComposeRecipientField,
    recipients: string,
  ) => void;
  reconnectRequired: boolean;
  selectedRecipients: string;
}) {
  const { t, i18n } = useLingui();
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  // Index of the suggestion highlighted with the arrow keys, -1 for none.
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const label = i18n._(RECIPIENT_LABELS[name]);
  const selectedEmailAddresses = splitRecipientList(selectedRecipients);

  const { data: contacts } = useSWR<ContactsResponse>(
    !env.NEXT_PUBLIC_CONTACTS_ENABLED || reconnectRequired || !active
      ? null
      : [
          `/api/user/contacts?query=${encodeURIComponent(debouncedQuery)}`,
          emailAccountId,
        ],
    {
      dedupingInterval: 5 * 60 * 1000,
      keepPreviousData: false,
      revalidateOnFocus: true,
      onSuccess(data) {
        if (data.reconnectRequired) onReconnectRequired();
      },
    },
  );

  // The parent latch stops further requests, but SWR runs onSuccess only for
  // the hook that starts one: a remount served a cached or deduplicated
  // response would never latch, so the prompt reads the data directly.
  const showReconnectPrompt =
    reconnectRequired || contacts?.reconnectRequired === true;

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(normalizedQuery), 150);
    return () => clearTimeout(timeout);
  }, [normalizedQuery]);

  const selectedAddresses = new Set(
    selectedEmailAddresses.map((address) =>
      extractEmailAddress(address).toLowerCase(),
    ),
  );
  const localContacts = useLocalContactSuggestions({
    emailAccountId,
    ownAddresses,
    selectedAddresses,
    query: debouncedQuery,
    active: active && normalizedQuery === debouncedQuery,
  });
  const suggestions =
    normalizedQuery && normalizedQuery === debouncedQuery
      ? mergeContactSuggestions(
          localContacts,
          contacts?.contacts ?? [],
          selectedAddresses,
        )
      : [];

  // The local input state resets on unmount (e.g. collapsing the recipient
  // fields), so the parent's pending entry must reset with it or hidden text
  // would still send.
  useEffect(
    () => () => onSearchQueryChange(name, ""),
    [name, onSearchQueryChange],
  );

  const updateSearchQuery = (query: string) => {
    setSearchQuery(query);
    setActiveIndex(-1);
    onSearchQueryChange(name, query);
  };

  const listOpen = active && !!suggestions.length;
  const highlightedIndex =
    activeIndex >= 0 && activeIndex < suggestions.length ? activeIndex : -1;

  const selectContact = (emailAddress: string) => {
    const selection = resolveRecipientSelection([
      ...selectedEmailAddresses,
      emailAddress,
    ]);
    if (selection === null) return;
    onSelectedRecipientsChange(name, selection);
    updateSearchQuery("");
  };

  // Valid typed addresses become tokens as soon as the user moves on, so what
  // is shown matches what will be sent.
  const commitSearchQuery = () => {
    if (!isValidComposeRecipientList(searchQuery.trim())) return false;
    onSelectedRecipientsChange(
      name,
      resolveComposeRecipients({
        selectedRecipients,
        pendingRecipient: searchQuery,
      }),
    );
    updateSearchQuery("");
    return true;
  };

  const removeSelectedEmail = (emailAddress: string) => {
    onSelectedRecipientsChange(
      name,
      selectedEmailAddresses
        .filter((email) => email !== emailAddress)
        .join(","),
    );
  };

  return (
    <div
      className={cn(
        "flex min-h-10 w-full flex-1 flex-wrap items-center gap-1.5 rounded-md text-sm disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-muted-foreground",
        className,
      )}
    >
      {selectedEmailAddresses.map((emailAddress) => (
        <Badge className="rounded-md" key={emailAddress} variant="secondary">
          <button
            aria-label={t`Edit ${emailAddress}`}
            className="cursor-pointer"
            onClick={() => {
              removeSelectedEmail(emailAddress);
              updateSearchQuery(emailAddress);
            }}
            type="button"
          >
            {extractNameFromEmail(emailAddress)}
          </button>
          <button
            aria-label={t`Remove ${emailAddress}`}
            onClick={() => removeSelectedEmail(emailAddress)}
            type="button"
          >
            <XIcon className="ml-1.5 size-3" />
          </button>
        </Badge>
      ))}

      <div className="relative min-w-32 flex-1">
        <input
          role="combobox"
          aria-label={label}
          aria-autocomplete="list"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listId : undefined}
          aria-activedescendant={
            highlightedIndex >= 0 ? `${listId}-${highlightedIndex}` : undefined
          }
          autoComplete="off"
          autoFocus={autoFocus}
          className="w-full border-none bg-background p-0 text-sm focus:border-none focus:ring-0"
          id={name}
          onBlur={(event) => {
            if (
              event.currentTarget.parentElement?.contains(event.relatedTarget)
            )
              return;
            commitSearchQuery();
          }}
          onChange={(event) => updateSearchQuery(event.target.value)}
          onFocus={() => onActivate(name)}
          onKeyDown={(event) => {
            if (listOpen) {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveIndex((index) =>
                  index + 1 >= suggestions.length ? 0 : index + 1,
                );
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveIndex((index) =>
                  index <= 0 ? suggestions.length - 1 : index - 1,
                );
                return;
              }
              if (event.key === "Enter" && highlightedIndex >= 0) {
                event.preventDefault();
                selectContact(suggestions[highlightedIndex].emailAddress);
                return;
              }
            }
            if (event.key !== "," && event.key !== ";") return;
            if (commitSearchQuery()) event.preventDefault();
          }}
          onKeyUp={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitSearchQuery();
          }}
          value={searchQuery}
        />

        {active && env.NEXT_PUBLIC_CONTACTS_ENABLED && showReconnectPrompt && (
          <div
            className="absolute z-10 mt-1 flex w-80 items-center gap-3 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-lg"
            role="status"
          >
            <span className="flex-1">
              <Trans>
                Reconnect this account to enable contact suggestions.
              </Trans>
            </span>
            <Button
              className="h-auto p-0"
              disabled={isReconnectingContacts}
              loading={isReconnectingContacts}
              onClick={onReconnectContacts}
              type="button"
              variant="link"
            >
              <Trans>Reconnect</Trans>
            </Button>
          </div>
        )}

        {listOpen && (
          <div
            id={listId}
            role="listbox"
            aria-label={label}
            className="absolute z-20 mt-1 max-h-72 w-max min-w-full max-w-[min(28rem,calc(100vw-3rem))] overflow-auto rounded-md border bg-popover py-1 text-sm shadow-lg focus:outline-none"
          >
            {suggestions.map((contact, index) => (
              <div
                id={`${listId}-${index}`}
                role="option"
                tabIndex={-1}
                aria-selected={index === highlightedIndex}
                className={`cursor-pointer select-none px-3 py-1 text-foreground ${index === highlightedIndex ? "bg-accent" : ""}`}
                key={contact.emailAddress}
                // mousedown, not click: keeps focus in the input so blur
                // does not commit the typed text first.
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectContact(contact.emailAddress);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <div className="my-2 flex items-center">
                  <Avatar className="shrink-0">
                    <AvatarImage
                      alt={contact.name ?? contact.emailAddress}
                      src={contact.profilePictureUrl ?? undefined}
                    />
                    <AvatarFallback>
                      {(contact.name || contact.emailAddress)
                        .at(0)
                        ?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="ml-3 flex min-w-0 flex-col justify-center">
                    {contact.name && (
                      <div className="truncate font-medium text-foreground">
                        {contact.name}
                      </div>
                    )}
                    <div className="truncate text-sm text-muted-foreground">
                      {contact.emailAddress}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
