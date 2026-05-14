"use client";

import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, X, SlidersHorizontal, Clock, Tag } from "lucide-react";
import { searchApi, itemsApi, type Item } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [contentFilter, setContentFilter] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value;
    setQuery(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedQuery(v), 300);
  }, []);

  // Search results when there's a query
  const { data: searchData, isLoading: searchLoading } = useQuery({
    queryKey: ["search", debouncedQuery, contentFilter],
    queryFn: () => searchApi.search(debouncedQuery, {
      content_type: contentFilter ?? undefined,
    }),
    enabled: debouncedQuery.length > 0,
  });

  // Recent items when there's no query (browse mode) — also respects content filter
  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ["items", "recent-search", contentFilter],
    queryFn: () => itemsApi.list({
      page: 1,
      page_size: 20,
      content_type: contentFilter ?? undefined,
    }),
    enabled: debouncedQuery.length === 0,
  });

  const contentTypes = ["text", "url", "pdf", "image", "audio", "video", "doc", "file"];

  function clearSearch() {
    setQuery("");
    setDebouncedQuery("");
    setContentFilter(null);
  }

  const hasQuery = debouncedQuery.length > 0;
  const isLoading = hasQuery ? searchLoading : recentLoading;
  const results = hasQuery ? searchData?.results : null;
  const recentItems = !hasQuery ? recentData?.results : null;
  const totalResults = hasQuery ? searchData?.total : recentData?.total;

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Search across all your saved items by title, content, URL, or tags.
        </p>
      </div>

      {/* Search bar */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search items, notes, URLs, tags..."
            value={query}
            onChange={handleChange}
            className="w-full rounded-xl border border-border bg-card pl-10 pr-20 py-3 text-sm outline-none focus:ring-2 focus:ring-primary transition-shadow"
            autoFocus
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {query && (
              <button
                onClick={clearSearch}
                className="p-1.5 rounded-md hover:bg-muted transition-colors"
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                "p-1.5 rounded-md transition-colors",
                showFilters ? "bg-primary text-primary-foreground" : "hover:bg-muted"
              )}
              title="Filters"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="flex flex-wrap gap-2 p-3 rounded-lg bg-muted/50 border border-border">
            <span className="text-xs text-muted-foreground self-center mr-1">Type:</span>
            <button
              onClick={() => setContentFilter(null)}
              className={cn(
                "text-xs rounded-full px-2.5 py-1 transition-colors",
                contentFilter === null
                  ? "bg-primary text-primary-foreground"
                  : "bg-background border border-border hover:bg-accent"
              )}
            >
              All
            </button>
            {contentTypes.map((type) => (
              <button
                key={type}
                onClick={() => setContentFilter(type === contentFilter ? null : type)}
                className={cn(
                  "text-xs rounded-full px-2.5 py-1 transition-colors capitalize",
                  contentFilter === type
                    ? "bg-primary text-primary-foreground"
                    : "bg-background border border-border hover:bg-accent"
                )}
              >
                {type}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Results section */}
      <div className="space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {hasQuery ? (
            <p>{isLoading ? "Searching..." : `${totalResults ?? 0} results for "${debouncedQuery}"`}</p>
          ) : (
            <p className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {isLoading ? "Loading..." : `${totalResults ?? 0} recent items`}
            </p>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-24 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : hasQuery && results?.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No results for &ldquo;{debouncedQuery}&rdquo;</p>
            <p className="text-xs mt-1">Try different keywords, or check the content type filter.</p>
          </div>
        ) : hasQuery && results ? (
          <div className="grid grid-cols-1 gap-3">
            {results.map((result) => (
              <SearchResultCard key={result.id} result={result} query={debouncedQuery} />
            ))}
          </div>
        ) : recentItems && recentItems.length > 0 ? (
          <div className="grid grid-cols-1 gap-3">
            {recentItems.map((item) => (
              <RecentItemCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-muted-foreground">
            <Search className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p>No items yet. Save something to get started.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Search result card ─────────────────────────────────────────────────────

function SearchResultCard({
  result,
  query,
}: {
  result: {
    id: string;
    title: string | null;
    summary: string | null;
    content_type: string;
    folder: { id: string; name?: string } | null;
    tags: string[];
    score: number;
    created_at: string;
  };
  query: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1.5 hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-2">
        <span className="text-xs bg-secondary rounded px-1.5 py-0.5 uppercase font-mono">
          {result.content_type}
        </span>
        {result.folder && (
          <span className="text-xs text-muted-foreground">
            📁 {result.folder.name || "Folder"}
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
      <div className="flex items-center gap-2 flex-wrap">
        {result.tags.slice(0, 5).map((t) => (
          <span key={t} className="text-xs bg-muted rounded-full px-2 py-0.5">
            #{t}
          </span>
        ))}
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(result.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}

// ─── Recent item card (browse mode) ─────────────────────────────────────────

function RecentItemCard({ item }: { item: Item }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-1.5 hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-2">
        <span className="text-xs bg-secondary rounded px-1.5 py-0.5 uppercase font-mono">
          {item.content_type}
        </span>
        {item.folder && (
          <span className="text-xs text-muted-foreground">
            {item.folder.emoji ?? "📁"} {item.folder.name}
          </span>
        )}
        {item.is_starred && (
          <span className="text-xs text-yellow-500">★</span>
        )}
      </div>
      <p className="font-medium text-sm">
        {item.title || item.ai_title || "Untitled"}
      </p>
      {item.summary && (
        <p className="text-xs text-muted-foreground line-clamp-2">{item.summary}</p>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {(item.tags ?? []).slice(0, 5).map((t) => (
          <span key={t} className="text-xs bg-muted rounded-full px-2 py-0.5">
            #{t}
          </span>
        ))}
        {item.source_url && (
          <span className="text-xs text-primary truncate max-w-[200px]">
            {item.source_url}
          </span>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {new Date(item.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
