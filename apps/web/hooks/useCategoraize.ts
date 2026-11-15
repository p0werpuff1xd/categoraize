import { useRef } from "react";
import useSWR from "swr";
import type { CategoraizeCategoriesResponse } from "@/app/api/categorai/categories/route";
import type { CategoraizeClassificationsResponse } from "@/app/api/categorai/classifications/route";
import type { CategoraizeLatestResponse } from "@/app/api/categorai/classifications/latest/route";
import type { CategoraizeStatusResponse } from "@/app/api/categorai/status/route";
import type { CategoraizeConsentResponse } from "@/app/api/user/categoraize-consent/route";

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
