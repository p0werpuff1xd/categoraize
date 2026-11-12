import useSWR from "swr";
import type { CategoraizeCategoriesResponse } from "@/app/api/categorai/categories/route";
import type { CategoraizeClassificationsResponse } from "@/app/api/categorai/classifications/route";

export function useCategoraizeCategories() {
  return useSWR<CategoraizeCategoriesResponse>("/api/categorai/categories");
}

export function useCategoraizeClassifications() {
  return useSWR<CategoraizeClassificationsResponse>(
    "/api/categorai/classifications?limit=200",
  );
}
