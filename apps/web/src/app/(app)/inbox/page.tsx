"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { X, ExternalLink, Star, Sparkles, AlertCircle } from "lucide-react";
import { itemsApi, type Item } from "@/lib/api";
import { ItemCard } from "@/components/items/ItemCard";
import { UploadZone } from "@/components/upload/UploadZone";
import { cn } from "@/lib/utils";

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Item | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["items", { page }],
    queryFn: () => itemsApi.list({ page, page_size: 20 }),
  });

  function handleStar(item: Item) {
    itemsApi.update(item.id, { is_starred: !item.is_starred }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    });
  }

  function handleSuccess() {
    queryClient.invalidateQueries({ queryKey: ["items"] });
  }

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className={cn("flex-1 overflow-auto p-6 space-y-6", selected && "lg:mr-80")}>
        <div>
          <h1 className="text-2xl font-bold">Inbox</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Save anything — AI will organise it automatically.
          </p>
        </div>

        <UploadZone onSuccess={handleSuccess} />

        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Recent items {data && `(${data.total})`}
          </h2>

          {isLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : data?.results.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <p className="text-lg font-medium">Your inbox is empty</p>
              <p className="text-sm mt-1">Save a URL, text, or file to get started.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {data?.results.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onStar={handleStar}
                    onClick={setSelected}
                  />
                ))}
              </div>

              {data && data.total > 20 && (
                <div className="flex justify-center gap-2 pt-4">
                  <button
                    disabled={page === 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="self-center text-sm text-muted-foreground">
                    Page {page} of {Math.ceil(data.total / 20)}
                  </span>
                  <button
                    disabled={page >= Math.ceil(data.total / 20)}
                    onClick={() => setPage((p) => p + 1)}
                    className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="fixed right-0 top-0 bottom-0 w-80 bg-card border-l border-border shadow-xl z-20 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-border">
            <span className="text-xs font-mono uppercase bg-muted px-2 py-0.5 rounded">
              {selected.content_type}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleStar(selected)}
                className={cn("p-1.5 rounded hover:bg-muted", selected.is_starred && "text-yellow-500")}
              >
                <Star className="h-4 w-4" fill={selected.is_starred ? "currentColor" : "none"} />
              </button>
              <button onClick={() => setSelected(null)} className="p-1.5 rounded hover:bg-muted">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-4">
            <div className="space-y-1">
              {selected.title && (
                <h2 className="font-semibold text-sm leading-snug">{selected.title}</h2>
              )}
              {selected.ai_title && (
                <div className="flex items-start gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                  <p className={cn(
                    "leading-snug",
                    selected.title ? "text-xs text-muted-foreground" : "font-semibold text-sm"
                  )}>
                    {selected.ai_title}
                  </p>
                </div>
              )}
              {!selected.title && !selected.ai_title && (
                <h2 className="font-semibold text-sm leading-snug text-muted-foreground">Untitled</h2>
              )}
            </div>

            {selected.confidence != null && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">AI confidence</span>
                <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all",
                      selected.confidence >= 0.8 ? "bg-emerald-500" :
                      selected.confidence >= 0.5 ? "bg-amber-500" : "bg-red-500"
                    )}
                    style={{ width: `${selected.confidence * 100}%` }}
                  />
                </div>
                <span className="font-mono text-xs">{(selected.confidence * 100).toFixed(0)}%</span>
              </div>
            )}

            {selected.needs_review && (
              <div className="flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded-md p-2 text-amber-800">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Low confidence — AI suggestions may need review.</span>
              </div>
            )}

            {selected.source_url && (
              <a
                href={selected.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-primary hover:underline truncate"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                {selected.source_url}
              </a>
            )}

            {selected.summary && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Summary</p>
                <p className="text-sm leading-relaxed">{selected.summary}</p>
              </div>
            )}

            {selected.tags.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Tags</p>
                <div className="flex flex-wrap gap-1">
                  {selected.tags.map((t) => (
                    <span key={t} className="text-xs bg-secondary rounded-full px-2 py-0.5">#{t}</span>
                  ))}
                </div>
              </div>
            )}

            {selected.entities && (
              <EntitiesSection entities={selected.entities} />
            )}

            {selected.folder && (
              <div className="space-y-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase">Folder</p>
                <p className="text-sm">{selected.folder.emoji} {selected.folder.name}</p>
              </div>
            )}

            <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t border-border">
              <p>Created {new Date(selected.created_at).toLocaleString()}</p>
              <p>Views: {selected.view_count}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ENTITY_LABELS: Record<string, string> = {
  people: "People",
  places: "Places",
  organisations: "Organisations",
  concepts: "Concepts",
};

function EntitiesSection({ entities }: { entities: NonNullable<Item["entities"]> }) {
  const sections = (Object.keys(ENTITY_LABELS) as Array<keyof typeof ENTITY_LABELS>)
    .map((k) => ({ key: k, items: entities[k] ?? [] }))
    .filter((s) => s.items.length > 0);
  if (sections.length === 0) return null;
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase">Entities</p>
      {sections.map((s) => (
        <div key={s.key}>
          <p className="text-xs text-muted-foreground mb-1">{ENTITY_LABELS[s.key]}</p>
          <div className="flex flex-wrap gap-1">
            {s.items.map((v) => (
              <span key={v} className="text-xs bg-muted rounded-full px-2 py-0.5">{v}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
