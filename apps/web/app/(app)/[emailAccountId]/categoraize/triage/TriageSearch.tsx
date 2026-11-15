"use client";

import { useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CategoraizeSearchBody } from "@/app/api/categorai/search/validation";

type Category = { id: string; name: string };

/** Semantic search with label, priority and deadline filters. */
export function TriageSearch({
  categories,
  active,
  disabledReason,
  onSearch,
  onClear,
}: {
  categories: Category[];
  active: boolean;
  disabledReason: string | null;
  onSearch: (params: CategoraizeSearchBody) => void;
  onClear: () => void;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [highPriority, setHighPriority] = useState(false);
  const [deadline, setDeadline] = useState("any");

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        if (!query.trim()) return;
        onSearch({
          query: query.trim(),
          limit: 25,
          offset: 0,
          ...(categoryId !== "all" && { categoryId }),
          ...(highPriority && { minimumPriority: 4 }),
          ...(deadline !== "any" && { hasDeadline: deadline === "with" }),
        });
      }}
    >
      <div className="relative min-w-[220px] flex-1">
        <SearchIcon
          className="absolute left-2.5 top-2.5 size-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          aria-label="Search emails by meaning"
          className="pl-8"
          placeholder='Search by meaning, e.g. "tuition payment" or "pulong sa Lunes"'
          value={query}
          maxLength={500}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <Select value={categoryId} onValueChange={setCategoryId}>
        <SelectTrigger className="h-9 w-[160px]" aria-label="Filter by label">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All labels</SelectItem>
          <SelectItem value="uncategorized">Uncategorized</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={deadline} onValueChange={setDeadline}>
        <SelectTrigger
          className="h-9 w-[150px]"
          aria-label="Filter by deadline"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="any">Any deadline</SelectItem>
          <SelectItem value="with">Has a deadline</SelectItem>
          <SelectItem value="without">No deadline</SelectItem>
        </SelectContent>
      </Select>
      <div className="flex items-center gap-2">
        <Switch
          id="search-p4plus"
          checked={highPriority}
          onCheckedChange={setHighPriority}
        />
        <Label htmlFor="search-p4plus">P4+ only</Label>
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={!query.trim() || Boolean(disabledReason)}
        title={disabledReason ?? undefined}
      >
        Search
      </Button>
      {active && (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setQuery("");
            onClear();
          }}
        >
          <XIcon className="mr-1 size-4" />
          Clear search
        </Button>
      )}
    </form>
  );
}
