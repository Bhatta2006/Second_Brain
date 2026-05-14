"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Tag, Plus } from "lucide-react";
import { type Folder } from "@/lib/api";
import { cn } from "@/lib/utils";

type FolderDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: { name: string; emoji: string; color: string; tags: string[] }) => Promise<void>;
  folder?: Folder | null;
  title?: string;
};

const EMOJI_OPTIONS = ["📁", "📂", "📚", "📖", "📝", "💼", "🎯", "🚀", "💡", "🔬", "🎨", "🎵", "🎮", "🏠", "💰", "🌟"];
const COLOR_OPTIONS = [
  { name: "Gray", value: "#6b7280" },
  { name: "Blue", value: "#3b82f6" },
  { name: "Green", value: "#10b981" },
  { name: "Yellow", value: "#f59e0b" },
  { name: "Red", value: "#ef4444" },
  { name: "Purple", value: "#8b5cf6" },
  { name: "Pink", value: "#ec4899" },
  { name: "Teal", value: "#14b8a6" },
];

const SUGGESTED_TAGS = [
  "work", "personal", "research", "ideas", "reference",
  "project", "learning", "finance", "health", "travel",
  "recipes", "bookmarks", "notes", "archive", "important",
];

export function FolderDialog({ open, onClose, onSubmit, folder, title }: FolderDialogProps) {
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("📁");
  const [color, setColor] = useState("#6b7280");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setLoading(false);
      if (folder) {
        setName(folder.name);
        setEmoji(folder.emoji || "📁");
        setColor(folder.color || "#6b7280");
        setTags([]);
      } else {
        setName("");
        setEmoji("📁");
        setColor("#6b7280");
        setTags([]);
      }
      setTagInput("");
    }
  }, [open, folder]);

  function addTag(tag: string) {
    const trimmed = tag.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags(tags.filter((t) => t !== tag));
  }

  function handleTagKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    setLoading(true);
    try {
      await onSubmit({ name: name.trim(), emoji, color, tags });
      // Only close on success — the parent sets dialogOpen=false too,
      // but this ensures the dialog stays open on error.
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save folder");
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 animate-in fade-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title || (folder ? "Edit Folder" : "New Folder")}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-muted transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name input */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Folder Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Work Projects"
              autoFocus
              disabled={loading}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            />
          </div>

          {/* Emoji picker */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Icon</label>
            <div className="grid grid-cols-8 gap-2">
              {EMOJI_OPTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  disabled={loading}
                  className={cn(
                    "aspect-square rounded-md border-2 text-xl hover:bg-accent transition-colors disabled:opacity-50",
                    emoji === e ? "border-primary bg-accent" : "border-transparent"
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Color picker */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Color</label>
            <div className="grid grid-cols-8 gap-2">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setColor(c.value)}
                  disabled={loading}
                  className={cn(
                    "aspect-square rounded-md border-2 transition-all disabled:opacity-50",
                    color === c.value ? "border-foreground scale-110" : "border-transparent"
                  )}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
          </div>

          {/* Tags section */}
          <div>
            <label className="flex items-center gap-1.5 text-sm font-medium mb-1.5">
              <Tag className="h-3.5 w-3.5" />
              Tags (optional)
            </label>
            
            {/* Current tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="flex items-center gap-1 text-xs bg-primary/10 text-primary rounded-full px-2.5 py-1 border border-primary/20"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Tag input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type a tag and press Enter"
                disabled={loading}
                className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => addTag(tagInput)}
                disabled={loading || !tagInput.trim()}
                className="rounded-md border border-border px-2 py-1.5 text-xs hover:bg-accent transition-colors disabled:opacity-50"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>

            {/* Suggested tags */}
            <div className="flex flex-wrap gap-1 mt-2">
              {SUGGESTED_TAGS.filter((t) => !tags.includes(t))
                .slice(0, 8)
                .map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => addTag(tag)}
                    disabled={loading}
                    className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
                  >
                    +{tag}
                  </button>
                ))}
            </div>
          </div>

          {/* Error display */}
          {error && (
            <div className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2 border border-destructive/20">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="flex-1 rounded-md border border-border px-4 py-2 text-sm hover:bg-accent transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Creating..." : folder ? "Save" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
