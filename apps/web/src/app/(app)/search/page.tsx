"use client";

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Search, Filter, X, Zap, Sparkles, FolderOpen } from "lucide-react";
import { searchApi, foldersApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  FadeUp,
  Stagger,
  fadeUpItem,
  EASE_OUT,
} from "@/components/ui/motion";

const CONTENT_TYPES = ["url", "pdf", "image", "text", "audio", "video", "doc"];

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [semantic, setSemantic] = useState(false);
  const [contentType, setContentType] = useState("");
  const [folderId, setFolderId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [isStarred, setIsStarred] = useState<boolean | undefined>(undefined);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: folders } = useQuery({
    queryKey: ["folders"],
    queryFn: foldersApi.tree,
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setQuery(v);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(v), 300);
  }

  const hasFilters = !!(contentType || folderId || dateFrom || dateTo || isStarred !== undefined);

  const { data, isLoading } = useQuery({
    queryKey: ["search", debouncedQuery, semantic, contentType, folderId, dateFrom, dateTo, isStarred],
    queryFn: () => {
      if (semantic) {
        return searchApi.semantic({
          query: debouncedQuery,
          content_type: contentType || undefined,
          folder_id: folderId || undefined,
          limit: 20,
        });
      }
      return searchApi.search(debouncedQuery, {
        content_type: contentType || undefined,
        folder_id: folderId || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        is_starred: isStarred,
      });
    },
    enabled: debouncedQuery.length > 0,
  });

  function clearFilters() {
    setContentType("");
    setFolderId("");
    setDateFrom("");
    setDateTo("");
    setIsStarred(undefined);
  }

  function flattenFolders(folders: any[], depth = 0): { id: string; name: string; depth: number }[] {
    const result: { id: string; name: string; depth: number }[] = [];
    for (const f of folders) {
      result.push({ id: f.id, name: f.name, depth });
      if (f.children?.length) result.push(...flattenFolders(f.children, depth + 1));
    }
    return result;
  }

  const flatFolders = flattenFolders(folders ?? []);
  const activeFilterCount = [
    contentType,
    folderId,
    dateFrom,
    dateTo,
    isStarred !== undefined ? "1" : "",
  ].filter(Boolean).length;

  return (
    <div className="relative min-h-full">
      <div className="absolute inset-0 -z-10 bg-dots opacity-[0.4] pointer-events-none" />

      <div className="p-6 md:p-8 max-w-3xl mx-auto space-y-6">
        <FadeUp>
          <h1 className="font-display text-3xl md:text-4xl font-bold tracking-tight">Search</h1>
          <p className="text-sm text-muted-foreground mt-1.5">
            Search across everything in your knowledge base.
          </p>
        </FadeUp>

        {/* Search bar + controls */}
        <FadeUp delay={0.05} className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="group relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground transition-colors group-focus-within:text-brand" />
              <input
                type="text"
                placeholder="Search items, notes, URLs..."
                value={query}
                onChange={handleChange}
                className="w-full rounded-2xl border border-border bg-card pl-11 pr-4 py-3.5 text-sm shadow-soft outline-none transition-all placeholder:text-muted-foreground/70 focus:border-brand/40 focus:shadow-brand focus:ring-4 focus:ring-brand/10"
                autoFocus
              />
            </div>

            <div className="flex gap-2.5">
              {/* Semantic toggle */}
              <button
                onClick={() => setSemantic((s) => !s)}
                title={semantic ? "Switch to keyword search" : "Switch to semantic (AI) search"}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3.5 rounded-2xl border text-sm font-medium transition-all duration-200",
                  semantic
                    ? "border-brand bg-brand text-brand-foreground shadow-brand"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Zap className={cn("h-3.5 w-3.5 transition-transform", semantic && "fill-current")} />
                AI
              </button>

              {/* Filter toggle */}
              <button
                onClick={() => setShowFilters((s) => !s)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3.5 rounded-2xl border text-sm font-medium transition-all duration-200",
                  showFilters || hasFilters
                    ? "border-brand/40 bg-brand-muted text-brand"
                    : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                <Filter className="h-3.5 w-3.5" />
                Filters
                {hasFilters && (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand text-[10px] text-brand-foreground font-bold font-mono">
                    {activeFilterCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Filters panel */}
          <AnimatePresence initial={false}>
            {showFilters && (
              <motion.div
                key="filters"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
                className="overflow-hidden"
              >
                <div className="rounded-2xl border border-border bg-card p-5 space-y-4 shadow-soft">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Filters</span>
                    {hasFilters && (
                      <button
                        onClick={clearFilters}
                        className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-1"
                      >
                        <X className="h-3 w-3" /> Clear all
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {/* Content type */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Type</label>
                      <select
                        value={contentType}
                        onChange={(e) => setContentType(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                      >
                        <option value="">All types</option>
                        {CONTENT_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>

                    {/* Folder */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Folder</label>
                      <select
                        value={folderId}
                        onChange={(e) => setFolderId(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                      >
                        <option value="">All folders</option>
                        {flatFolders.map((f) => (
                          <option key={f.id} value={f.id}>
                            {"  ".repeat(f.depth)}{f.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date from */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">From date</label>
                      <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                      />
                    </div>

                    {/* Date to */}
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">To date</label>
                      <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        className="mt-1.5 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none transition-all focus:border-brand/40 focus:ring-2 focus:ring-brand/15"
                      />
                    </div>
                  </div>

                  {/* Starred filter */}
                  <label className="flex items-center gap-2 cursor-pointer w-fit group/star">
                    <input
                      type="checkbox"
                      checked={isStarred === true}
                      onChange={(e) => setIsStarred(e.target.checked ? true : undefined)}
                      className="rounded accent-[hsl(var(--brand))]"
                    />
                    <span className="text-sm group-hover/star:text-foreground transition-colors">Starred only</span>
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </FadeUp>

        {/* Search mode indicator */}
        <AnimatePresence>
          {debouncedQuery && (
            <motion.p
              key="mode"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-1.5 text-xs text-muted-foreground"
            >
              {semantic ? (
                <Sparkles className="h-3.5 w-3.5 text-brand" />
              ) : (
                <Search className="h-3.5 w-3.5" />
              )}
              <span className={cn("font-medium", semantic && "text-brand")}>
                {semantic ? "Semantic (AI) search" : "Keyword search"}
              </span>
              <span className="opacity-60">·</span>
              {isLoading ? (
                <span className="animate-shimmer bg-gradient-to-r from-muted-foreground via-foreground to-muted-foreground bg-[length:200%_100%] bg-clip-text text-transparent">
                  Searching…
                </span>
              ) : (
                <span>
                  {data?.total ?? 0} results for &ldquo;{debouncedQuery}&rdquo;
                </span>
              )}
            </motion.p>
          )}
        </AnimatePresence>

        {/* Results */}
        {debouncedQuery && !isLoading && (
          <>
            {data?.results.length === 0 ? (
              <FadeUp className="flex flex-col items-center text-center py-16">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted mb-4">
                  <Search className="h-6 w-6 text-muted-foreground" />
                </div>
                <p className="font-display text-lg font-semibold">No results found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Nothing matched &ldquo;{debouncedQuery}&rdquo;.
                </p>
                {!semantic && (
                  <button
                    onClick={() => setSemantic(true)}
                    className="mt-5 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-medium text-brand-foreground shadow-brand transition-transform hover:scale-[1.02] active:scale-95"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Try AI semantic search instead
                  </button>
                )}
              </FadeUp>
            ) : (
              <Stagger className="space-y-2.5">
                {data?.results.map((result) => (
                  <motion.div
                    key={result.id}
                    variants={fadeUpItem}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.2, ease: EASE_OUT }}
                    className="group rounded-2xl border border-border bg-card p-4 space-y-2 shadow-soft transition-colors hover:border-brand/40 hover:shadow-lift"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] tracking-wide bg-secondary rounded-md px-2 py-0.5 uppercase font-mono font-medium text-secondary-foreground">
                        {result.content_type}
                      </span>
                      {result.folder && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <FolderOpen className="h-3 w-3" />
                          {result.folder.name}
                        </span>
                      )}
                      {semantic && (
                        <span className="ml-auto text-[11px] font-mono font-semibold text-success bg-success/10 px-2 py-0.5 rounded-md">
                          {(result.score * 100).toFixed(0)}% match
                        </span>
                      )}
                      <span className={cn("text-xs text-muted-foreground", !semantic && "ml-auto")}>
                        {new Date(result.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="font-medium text-sm group-hover:text-brand transition-colors">
                      {result.title ?? "Untitled"}
                    </p>
                    {result.summary && (
                      <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                        {result.summary}
                      </p>
                    )}
                    {result.tags.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap pt-0.5">
                        {result.tags.slice(0, 5).map((t) => (
                          <span
                            key={t}
                            className="text-[11px] font-mono bg-muted rounded-md px-1.5 py-0.5 text-muted-foreground"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    )}
                  </motion.div>
                ))}
              </Stagger>
            )}
          </>
        )}

        {/* Loading skeletons */}
        {isLoading && debouncedQuery && (
          <div className="space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-24 rounded-2xl border border-border bg-card overflow-hidden relative"
              >
                <div className="absolute inset-0 animate-shimmer bg-gradient-to-r from-transparent via-muted to-transparent bg-[length:200%_100%]" />
              </div>
            ))}
          </div>
        )}

        {/* Empty / idle state */}
        {!debouncedQuery && (
          <FadeUp delay={0.1} className="flex flex-col items-center text-center py-20">
            <div className="relative mb-5">
              <div className="absolute inset-0 rounded-3xl bg-brand/20 blur-2xl" />
              <div className="relative flex h-16 w-16 items-center justify-center rounded-3xl border border-border bg-card shadow-lift">
                <Search className="h-7 w-7 text-brand" />
              </div>
            </div>
            <p className="font-display text-xl font-semibold">Search your knowledge base</p>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs">
              Start typing to find anything you&rsquo;ve saved. Toggle{" "}
              <span className="inline-flex items-center gap-0.5 font-medium text-brand">
                <Zap className="h-3 w-3" /> AI
              </span>{" "}
              for semantic search.
            </p>
          </FadeUp>
        )}
      </div>
    </div>
  );
}
