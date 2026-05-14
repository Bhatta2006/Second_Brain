"use client";

import { useState, useEffect } from "react";
import { X, Loader2, Tag, Plus } from "lucide-react";
import { type Folder } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

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
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save folder");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title || (folder ? "Edit Folder" : "New Folder")}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name input */}
          <div className="space-y-1.5">
            <Label htmlFor="name">Folder Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Work Projects"
              autoFocus
              disabled={loading}
            />
          </div>

          {/* Emoji picker */}
          <div className="space-y-1.5">
            <Label>Icon</Label>
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
          <div className="space-y-1.5">
            <Label>Color</Label>
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
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Tag className="h-3.5 w-3.5" />
              Tags (optional)
            </Label>

            {/* Current tags */}
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="hover:text-destructive transition-colors"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {/* Tag input */}
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleTagKeyDown}
                placeholder="Type a tag and press Enter"
                disabled={loading}
                className="text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => addTag(tagInput)}
                disabled={loading || !tagInput.trim()}
              >
                <Plus className="h-3 w-3" />
              </Button>
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

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || loading}>
              {loading && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {loading ? "Creating..." : folder ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
