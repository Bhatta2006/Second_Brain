"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { searchApi } from "@/lib/api";
import { ItemCard } from "@/components/items/ItemCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { data, isLoading } = useQuery({
    queryKey: ["search", debouncedQuery, page],
    queryFn: () =>
      debouncedQuery.trim()
        ? searchApi.search(debouncedQuery, { page })
        : Promise.resolve({ total: 0, page: 1, results: [] }),
    enabled: debouncedQuery.trim().length > 0,
  });

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Search</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Find items by title, content, or tags
            </p>
          </div>

          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search your knowledge base..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!isLoading && debouncedQuery.trim() && data && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {data.total} result{data.total !== 1 ? "s" : ""}
                </p>
                {data.total > 0 && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {page}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={data.results.length < 20}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>

              {data.results.length === 0 ? (
                <Card>
                  <CardContent className="p-6 text-center text-muted-foreground">
                    No results found for &quot;{debouncedQuery}&quot;
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {data.results.map((result) => (
                    <Card key={result.id} className="hover:shadow-md transition-shadow cursor-pointer">
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <CardTitle className="text-base font-medium leading-snug truncate">
                              {result.title || "Untitled"}
                            </CardTitle>
                          </div>
                          <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                            {result.content_type}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 space-y-2">
                        {result.summary && (
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {result.summary}
                          </p>
                        )}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          {result.folder && (
                            <span>📁 {result.folder.name}</span>
                          )}
                          <span>Score: {(result.score * 100).toFixed(0)}%</span>
                        </div>
                        {result.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {result.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-[10px]">
                                #{tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          )}

          {!debouncedQuery.trim() && (
            <div className="text-center py-16 text-muted-foreground">
              <SearchIcon className="mx-auto h-12 w-12 mb-4 opacity-20" />
              <p className="text-lg font-medium">Start typing to search</p>
              <p className="text-sm mt-1">Search across all your saved items</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
