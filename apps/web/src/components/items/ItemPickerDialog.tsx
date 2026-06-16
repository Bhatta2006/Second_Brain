"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, FileText, Link as LinkIcon } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { itemsApi, type Item } from "@/lib/api";
import { SPRING, EASE_OUT } from "@/components/ui/motion";

type Props = {
  open: boolean;
  title: string;
  /** Item id to exclude from the list (you can't link an item to itself). */
  excludeId?: string;
  onPick: (item: Item) => void;
  onClose: () => void;
};

export function ItemPickerDialog({ open, title, excludeId, onPick, onClose }: Props) {
  const [search, setSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["items", { page_size: 100 }],
    queryFn: () => itemsApi.list({ page_size: 100 }),
    enabled: open,
  });

  const results = useMemo(() => {
    const all = (data?.results ?? []).filter((i) => !excludeId || i.id !== excludeId);
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((i) => {
      const hay = `${i.title ?? ""} ${i.ai_title ?? ""} ${i.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data, search, excludeId]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={SPRING}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-border px-4 py-3">
              <h2 className="flex items-center gap-2 font-display text-sm font-semibold">
                <LinkIcon className="h-4 w-4 text-brand" />
                {title}
              </h2>
            </div>

            <div className="p-3">
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  autoFocus
                  placeholder="Search items by title or tag…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none transition-shadow focus:border-brand focus:ring-2 focus:ring-brand/30"
                />
              </div>
            </div>

            <div className="max-h-80 overflow-auto px-2 pb-2">
              {results.length === 0 && (
                <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                  {search ? "No matching items." : "No other items to link to."}
                </p>
              )}
              {results.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onPick(item)}
                  className="group flex w-full items-start gap-2.5 rounded-lg px-2.5 py-2 text-left hover:bg-accent transition-colors"
                >
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand transition-colors" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {item.title ?? item.ai_title ?? item.source_url ?? "Untitled"}
                    </p>
                    {item.summary && (
                      <p className="truncate text-xs text-muted-foreground">{item.summary}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>

            <div className="flex justify-end border-t border-border px-4 py-3">
              <button
                onClick={onClose}
                className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
