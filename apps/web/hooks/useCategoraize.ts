import { useRef } from "react";
import useSWR from "swr";
import type { CategoraizeCategoriesResponse } from "@/app/api/categorai/categories/route";
import type { CategoraizeClassificationsResponse } from "@/app/api/categorai/classifications/route";
import type { CategoraizeLatestResponse } from "@/app/api/categorai/classifications/latest/route";
import type { CategoraizeStatusResponse } from "@/app/api/categorai/status/route";
import type { CategoraizeConsentResponse } from "@/app/api/user/categoraize-consent/route";
import type { CategoraizeSearchResponse } from "@/app/api/categorai/search/route";
import type { CategoraizeSearchBody } from "@/app/api/categorai/search/validation";
import type { CategoraizeTaskSheetResponse } from "@/app/api/categorai/task-sheet/route";
import type { CategoraizeContactsResponse } from "@/app/api/categorai/contacts/route";
import type { CategoraizeProposalsResponse } from "@/app/api/categorai/proposals/route";
import type { CategoraizeSuggestedLabelsResponse } from "@/app/api/categorai/suggested-labels/route";
import { swrFetcher } from "@/providers/swr-fetcher";
import { useAccount } from "@/providers/EmailAccountProvider";

export function useCategoraizeContacts() {
  return useSWR<CategoraizeContactsResponse>("/api/categorai/contacts");
}

export function useCategoraizeProposals() {
  return useSWR<CategoraizeProposalsResponse>("/api/categorai/proposals");
}

export function useCategoraizeSuggestedLabels() {
  return useSWR<CategoraizeSuggestedLabelsResponse>(
    "/api/categorai/suggested-labels",
  );
}

export function useCategoraizeTaskSheet(open: boolean) {
  return useSWR<CategoraizeTaskSheetResponse>(
    open ? "/api/categorai/task-sheet" : null,
  );
}

export function useCategoraizeConsent() {
  return useSWR<CategoraizeConsentResponse>("/api/user/categoraize-consent");
}

export function useCategoraizeCategories() {
  return useSWR<CategoraizeCategoriesResponse>("/api/categorai/categories");
}

/**
 * The triage list only refreshes when asked (new-mail pill, mutations), so
 * rows never reorder under the reader.
 */
export function useCategoraizeClassifications() {
  return useSWR<CategoraizeClassificationsResponse>(
    "/api/categorai/classifications?limit=200",
    { revalidateOnFocus: false, revalidateOnReconnect: false },
  );
}

/** Semantic search over analyzed emails (POST); null params means no search. */
export function useCategoraizeSearch(params: CategoraizeSearchBody | null) {
  const { emailAccountId } = useAccount();
  return useSWR<CategoraizeSearchResponse>(
    params ? ["/api/categorai/search", JSON.stringify(params)] : null,
    ([url, body]: [string, string]) =>
      swrFetcher(
        url,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body,
        },
        emailAccountId,
      ),
    { revalidateOnFocus: false },
  );
}

export function useCategoraizeLatest() {
  return useSWR<CategoraizeLatestResponse>(
    "/api/categorai/classifications/latest",
    { refreshInterval: 30_000 },
  );
}

/** Polls the NLP service, backing off from 5 s to 60 s while it is down or loading. */
export function useCategoraizeServiceStatus() {
  const failures = useRef(0);
  return useSWR<CategoraizeStatusResponse>("/api/categorai/status", {
    refreshInterval: (data) =>
      data?.status === "ready" || data?.status === "disabled"
        ? 120_000
        : Math.min(5000 * 2 ** failures.current, 60_000),
    onSuccess: (data) => {
      failures.current =
        data.status === "ready" || data.status === "disabled"
          ? 0
          : failures.current + 1;
    },
  });
}
