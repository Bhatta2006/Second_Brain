"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { X, ExternalLink, Star, Sparkles, AlertCircle, Eye, GitBranch, Link2 } from "lucide-react";
import { itemsApi, type Item } from "@/lib/api";
import { ItemCard } from "@/components/items/ItemCard";
import { UploadZone } from "@/components/upload/UploadZone";
import { FileViewer } from "@/components/items/FileViewer";
import { cn } from "@/lib/utils";
import { FadeUp, Stagger, fadeUpItem, SPRING } from "@/components/ui/motion";

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Item | null>(null);
  const [viewingItem, setViewingItem] = useState<Item | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["items", { page }],
    queryFn: () => itemsApi.list({ page, page_size: 20 }),
  });

  function handleStar(item: Item) {
    itemsApi.update(item.id, { is_starred: !item.is_starred }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    });
    // Keep the detail-panel snapshot in sync so its star icon doesn't go stale.
    setSelected((s) => (s && s.id === item.id ? { ...s, is_starred: !item.is_starred } : s));
  }

  function handleSuccess() {
    queryClient.invalidateQueries({ queryKey: ["items"] });
  }

  return (
    <div className="flex h-full">
      {/* Main content */}
      <div className={cn("relative flex-1 overflow-auto", selected && "lg:mr-[340px]")}>
        {/* ambient grid texture behind the hero */}
        <div aria-hidden className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-64 opacity-[0.5] [mask-image:linear-gradient(to_bottom,black,transparent)]" />

        <div className="relative mx-auto w-full max-w-5xl p-6 space-y-8">
          {/* Hero header */}
          <FadeUp className="space-y-2 pt-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground shadow-soft">
              <Sparkles className="h-3 w-3 text-brand" />
              Capture
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight">
              Your <span className="text-gradient">Inbox</span>
            </h1>
            <p className="max-w-md text-sm text-muted-foreground">
              Save anything — AI will organise it automatically.
            </p>
          </FadeUp>

          <FadeUp delay={0.06}>
            <UploadZone onSuccess={handleSuccess} />
          </FadeUp>

          <div className="space-y-4">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Recent items {data && `(${data.total})`}
            </h2>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-32 rounded-2xl border border-border bg-card p-4 space-y-3 overflow-hidden shadow-soft">
                    <div className="flex items-center gap-2">
                      <div className="h-9 w-9 rounded-xl bg-muted animate-pulse" />
                      <div className="h-4 w-40 rounded bg-muted animate-pulse" />
                    </div>
                    <div className="h-3 w-full rounded bg-muted animate-pulse" />
                    <div className="h-3 w-3/4 rounded bg-muted animate-pulse" />
                    <div className="flex gap-1">
                      <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
                      <div className="h-5 w-12 rounded-full bg-muted animate-pulse" />
                    </div>
                  </div>
                ))}
              </div>
            ) : data?.results.length === 0 ? (
              <FadeUp className="flex flex-col items-center justify-center gap-5 py-20 text-muted-foreground">
                <motion.div
                  className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-border bg-card shadow-lift"
                  animate={{ y: [0, -6, 0] }}
                  transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
                >
                  <span aria-hidden className="absolute inset-0 rounded-2xl bg-brand/10 blur-xl" />
                  <Sparkles className="relative h-9 w-9 text-brand animate-glow-pulse" />
                </motion.div>
                <div className="text-center">
                  <p className="font-display text-lg font-semibold text-foreground">Your inbox is empty</p>
                  <p className="mt-1 text-sm">Paste a URL, drop a file, or write a note above.</p>
                </div>
              </FadeUp>
            ) : (
              <>
                <Stagger className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {data?.results.map((item) => (
                    <motion.div key={item.id} variants={fadeUpItem}>
                      <ItemCard
                        item={item}
                        onStar={handleStar}
                        onClick={setSelected}
                      />
                    </motion.div>
                  ))}
                </Stagger>

                {data && data.total > 20 && (
                  <div className="flex justify-center gap-2 pt-4">
                    <button
                      disabled={page === 1}
                      onClick={() => setPage((p) => p - 1)}
                      className="rounded-xl border border-border px-3.5 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <span className="self-center font-mono text-xs text-muted-foreground">
                      Page {page} of {Math.ceil(data.total / 20)}
                    </span>
                    <button
                      disabled={page >= Math.ceil(data.total / 20)}
                      onClick={() => setPage((p) => p + 1)}
                      className="rounded-xl border border-border px-3.5 py-1.5 text-sm transition-colors hover:bg-muted disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      <AnimatePresence>
        {selected && (
          <>
            {/* Mobile scrim */}
            <motion.div
              key="detail-scrim"
              className="fixed inset-0 z-20 bg-background/60 backdrop-blur-sm lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelected(null)}
            />
            <motion.div
              key="detail-panel"
              className="glass fixed right-0 top-0 bottom-0 z-30 flex w-full flex-col border-l border-border shadow-lift sm:w-[360px] lg:w-[340px]"
              initial={{ x: "100%", opacity: 0.6 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0.4 }}
              transition={SPRING}
            >
              <div className="flex items-center justify-between border-b border-border p-4">
                <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-xs uppercase tracking-wide">
                  {selected.content_type}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStar(selected)}
                    className={cn("rounded-lg p-1.5 transition-colors hover:bg-muted", selected.is_starred && "text-warning")}
                  >
                    <Star className="h-4 w-4" fill={selected.is_starred ? "currentColor" : "none"} />
                  </button>
                  <button onClick={() => setSelected(null)} className="rounded-lg p-1.5 transition-colors hover:bg-muted">
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
                  <Sparkles className="h-3.5 w-3.5 text-brand mt-0.5 shrink-0" />
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
                      selected.confidence >= 0.8 ? "bg-success" :
                      selected.confidence >= 0.5 ? "bg-warning" : "bg-destructive"
                    )}
                    style={{ width: `${selected.confidence * 100}%` }}
                  />
                </div>
                <span className="font-mono text-xs">{(selected.confidence * 100).toFixed(0)}%</span>
              </div>
            )}

            {selected.needs_review && (
              <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 p-2.5 text-xs text-warning">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>Low confidence — AI suggestions may need review.</span>
              </div>
            )}

            {selected.source_url && (
              <a
                href={selected.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-brand hover:underline truncate"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                {selected.source_url}
              </a>
            )}

            {(selected.storage_key || selected.content_type === "text" || selected.content_type === "url") && (
              <button
                onClick={() => setViewingItem(selected)}
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary py-2 text-xs font-medium text-primary-foreground shadow-soft transition-all hover:opacity-90 active:scale-[0.99]"
              >
                <Eye className="h-3.5 w-3.5" />
                {selected.storage_key ? "View file" : selected.content_type === "url" ? "View page content" : "View content"}
              </button>
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

                <SimilarItemsSection itemId={selected.id} onOpen={setSelected} />
                <BacklinksSection itemId={selected.id} onOpen={setSelected} />
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {viewingItem && (
        <FileViewer item={viewingItem} onClose={() => setViewingItem(null)} />
      )}
    </div>
  );
}

function SimilarItemsSection({ itemId, onOpen }: { itemId: string; onOpen: (i: Item) => void }) {
  const { data } = useQuery({
    queryKey: ["similar", itemId],
    queryFn: () => itemsApi.similar(itemId, 5),
    enabled: !!itemId,
  });

  const items = data?.results ?? [];
  if (items.length === 0) return null;

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
        <GitBranch className="h-3 w-3" /> Similar items
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onOpen(item)}
            className="w-full text-left rounded-lg border border-border bg-muted/30 p-2 text-xs hover:bg-muted transition-colors"
          >
            <p className="font-medium truncate">{item.title ?? item.ai_title ?? "Untitled"}</p>
            {item.summary && <p className="text-muted-foreground line-clamp-1 mt-0.5">{item.summary}</p>}
          </button>
        ))}
      </div>
    </div>
  );
}

function BacklinksSection({ itemId, onOpen }: { itemId: string; onOpen: (i: Item) => void }) {
  const { data } = useQuery({
    queryKey: ["backlinks", itemId],
    queryFn: () => itemsApi.backlinks(itemId),
    enabled: !!itemId,
  });

  const items = data?.results ?? [];
  if (items.length === 0) return null;

  return (
    <div className="space-y-2 pt-2 border-t border-border">
      <p className="text-xs font-semibold text-muted-foreground uppercase flex items-center gap-1">
        <Link2 className="h-3 w-3" /> Backlinks ({items.length})
      </p>
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onOpen(item)}
            className="w-full text-left rounded-lg border border-border bg-muted/30 p-2 text-xs hover:bg-muted transition-colors"
          >
            <p className="font-medium truncate">{item.title ?? item.ai_title ?? "Untitled"}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

type EntityKey = keyof NonNullable<Item["entities"]>;

const ENTITY_LABELS: Record<EntityKey, string> = {
  people: "People",
  places: "Places",
  organisations: "Organisations",
  concepts: "Concepts",
};

function EntitiesSection({ entities }: { entities: NonNullable<Item["entities"]> }) {
  const sections = (Object.keys(ENTITY_LABELS) as EntityKey[])
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
            {s.items.map((v: string) => (
              <span key={v} className="font-mono text-xs bg-muted rounded-full px-2 py-0.5">{v}</span>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
