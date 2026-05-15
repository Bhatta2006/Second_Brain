"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Tag, Plus } from "lucide-react";
import { itemsApi } from "@/lib/api";

type Props = {
  defaultTitle: string;
  onSave: (title: string, tags: string[]) => void;
  onSkip: () => void;
  onClose: () => void;
};

export function UploadOptionsDialog({ defaultTitle, onSave, onSkip, onClose }: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");

  const { data } = useQuery({
    queryKey: ["items", { page_size: 500 }],
    queryFn: () => itemsApi.list({ page_size: 500 }),
  });

  const existingTags = useMemo(() => {
    const tagSet = new Set<string>();
    data?.results.forEach((item) => item.tags.forEach((t) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [data]);

  const suggestions = useMemo(() => {
    const q = tagInput.trim().toLowerCase();
    const pool = existingTags.filter((t) => !selectedTags.includes(t));
    if (!q) return pool.slice(0, 30);
    return pool.filter((t) => t.toLowerCase().includes(q)).slice(0, 20);
  }, [existingTags, selectedTags, tagInput]);

  function addTag(tag: string) {
    const normalized = tag.trim().toLowerCase();
    if (!normalized || selectedTags.includes(normalized)) return;
    setSelectedTags((prev) => [...prev, normalized]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setSelectedTags((prev) => prev.filter((t) => t !== tag));
  }

  const showCreate =
    tagInput.trim().length > 0 &&
    !existingTags.includes(tagInput.trim().toLowerCase());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">Save options</h2>
            <p className="text-xs text-muted-foreground">
              Customise or skip — AI will fill any blanks
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Tag className="h-3 w-3" /> Tags
            </label>

            {/* Selected chips */}
            {selectedTags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {selectedTags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                  >
                    #{tag}
                    <button
                      onClick={() => removeTag(tag)}
                      className="rounded-full hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Input */}
            <div className="relative mt-2">
              <input
                type="text"
                placeholder={
                  existingTags.length > 0
                    ? "Search existing tags or type to create…"
                    : "Type a tag and press Enter…"
                }
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && tagInput.trim()) {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 pr-20 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              {showCreate && (
                <button
                  onClick={() => addTag(tagInput)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-0.5 text-xs text-primary hover:opacity-80"
                >
                  <Plus className="h-3 w-3" /> Create
                </button>
              )}
            </div>

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5 max-h-28 overflow-auto">
                {suggestions.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => addTag(tag)}
                    className="rounded-full bg-muted px-2.5 py-0.5 text-xs hover:bg-accent transition-colors"
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <button
            onClick={onSkip}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted transition-colors"
          >
            Skip — let AI decide
          </button>
          <button
            onClick={() => onSave(title, selectedTags)}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity"
          >
            Save with these options
          </button>
        </div>
      </div>
    </div>
  );
}
