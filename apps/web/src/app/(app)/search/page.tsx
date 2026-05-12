"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { searchApi } from "@/lib/api";
import { ItemCard } from "@/components/items/ItemCard";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    clearTimeout((window as unknown as { _st?: ReturnType<typeof setTimeout> })._st);
    (window as unknown as { _st?: ReturnType<typeof setTimeout> })._st = setTimeout(
      () => setDebouncedQuery(v),
      300
    );
  }

  const { data, isLoading } = useQuery({
    queryKey: ["search", debouncedQuery],
    queryFn: () => searchApi.search(debouncedQuery),
    enabled: debouncedQuery.length > 0,
  });

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search across all your saved items.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search items, notes, URLs..."
          value={query}
          onChange={handleChange}
          className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary"
          autoFocus
        />
      </div>

      {debouncedQuery && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {isLoading ? "Searching..." : `${data?.total ?? 0} results`}
          </p>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : data?.results.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>No results for "{debouncedQuery}"</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {data?.results.map((result) => (
                <div
                  key={result.id}
                  className="rounded-lg border border-border bg-card p-4 space-y-1"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-secondary rounded px-1.5 py-0.5 uppercase font-mono">
                      {result.content_type}
                    </span>
                    {result.folder && (
                      <span className="text-xs text-muted-foreground">
                        {result.folder.name}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-muted-foreground">
                      {(result.score * 100).toFixed(0)}% match
                    </span>
                  </div>
                  <p className="font-medium text-sm">{result.title ?? "Untitled"}</p>
                  {result.summary && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {result.summary}
                    </p>
                  )}
                  <div className="flex gap-1 flex-wrap">
                    {result.tags.slice(0, 4).map((t) => (
                      <span key={t} className="text-xs bg-muted rounded px-1.5 py-0.5">
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!debouncedQuery && (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-20" />
          <p>Type to search your knowledge base</p>
        </div>
      )}
    </div>
  );
}
