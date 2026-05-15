"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search as SearchIcon, FileText, Link as LinkIcon } from "lucide-react";
import { itemsApi, type Item } from "@/lib/api";

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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <LinkIcon className="h-4 w-4" />
            {title}
          </h2>
        </div>

        <div className="p-3">
          <div className="relative">
            <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              autoFocus
              placeholder="Search items by title or tag…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-md border border-border bg-background pl-8 pr-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary"
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
              className="flex w-full items-start gap-2 rounded-md px-2 py-2 text-left hover:bg-muted transition-colors"
            >
              <FileText className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
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
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
