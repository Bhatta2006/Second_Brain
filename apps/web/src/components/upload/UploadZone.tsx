"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Link, FileText, Tag, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { itemsApi, foldersApi } from "@/lib/api";
import { FolderPicker } from "@/components/folders/FolderPicker";

type Mode = "file" | "url" | "text";

type Props = {
  onSuccess?: (itemId: string) => void;
  defaultFolderId?: string | null;
};

const SUGGESTED_TAGS = [
  "work", "personal", "research", "ideas", "reference",
  "project", "learning", "finance", "health", "travel",
  "recipes", "bookmarks", "notes", "archive", "important",
];

export function UploadZone({ onSuccess, defaultFolderId }: Props) {
  const [mode, setMode] = useState<Mode>("url");
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState("");
  const [folderId, setFolderId] = useState<string | null>(defaultFolderId ?? null);

  useEffect(() => {
    if (defaultFolderId !== undefined) {
      setFolderId(defaultFolderId);
    }
  }, [defaultFolderId]);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: folders } = useQuery({
    queryKey: ["folders"],
    queryFn: () => foldersApi.tree(),
  });

  // Auto-populate custom name based on content
  function getAutoName(): string {
    if (mode === "file" && file) {
      return file.name.replace(/\.[^/.]+$/, "");
    } else if (mode === "url" && value) {
      try {
        const url = new URL(value);
        const pathname = url.pathname.split('/').filter(Boolean).pop() || url.hostname;
        return pathname.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      } catch {
        return "";
      }
    } else if (mode === "text" && value) {
      // Get first 50 chars of text as name
      return value.trim().substring(0, 50).replace(/\s+/g, " ");
    }
    return "";
  }

  function pickFile(f: File) {
    setFile(f);
    setValue(f.name);
    // Auto-populate custom name with file name (without extension)
    const nameWithoutExt = f.name.replace(/\.[^/.]+$/, "");
    setCustomName(nameWithoutExt);
  }

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

  async function readFileAsBase64(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(f); // Returns "data:mime;base64,..."
    });
  }

  async function readFileAsText(f: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = reject;
      reader.readAsText(f);
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() && !file) return;
    setError(null);
    setLoading(true);
    try {
      let res;
      const itemName = customName.trim() || undefined;
      
      if (mode === "file" && file) {
        // Check if it's a text-based file
        const isTextFile = file.type.startsWith('text/') || 
                          file.name.endsWith('.txt') || 
                          file.name.endsWith('.md') ||
                          file.name.endsWith('.csv') ||
                          file.name.endsWith('.json');
        
        if (isTextFile && file.size < 2 * 1024 * 1024) { // < 2MB text file
          const content = await readFileAsText(file);
          res = await itemsApi.ingest({
            type: "text",
            text: content,
            hint_folder_id: folderId ?? undefined,
            metadata: { 
              filename: file.name,
              custom_name: itemName,
              tags: tags.length > 0 ? tags : undefined,
            },
          });
        } else {
          // Read binary file as base64 and send to API directly
          // (avoids Supabase storage dependency)
          const base64Content = await readFileAsBase64(file);
          res = await itemsApi.ingest({
            type: "file",
            text: base64Content,
            file_key: file.name,
            hint_folder_id: folderId ?? undefined,
            metadata: { 
              filename: file.name, 
              size: file.size, 
              mime_type: file.type,
              custom_name: itemName,
              tags: tags.length > 0 ? tags : undefined,
              encoding: "base64",
            },
          });
        }
      } else if (mode === "url") {
        res = await itemsApi.ingest({
          type: "url",
          url: value,
          hint_folder_id: folderId ?? undefined,
          metadata: {
            custom_name: itemName,
            tags: tags.length > 0 ? tags : undefined,
          },
        });
      } else {
        // Text mode
        res = await itemsApi.ingest({
          type: "text",
          text: value,
          hint_folder_id: folderId ?? undefined,
          metadata: {
            custom_name: itemName,
            tags: tags.length > 0 ? tags : undefined,
          },
        });
      }
      setValue("");
      setFile(null);
      setCustomName("");
      setTags([]);
      setTagInput("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      onSuccess?.(res.item_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = mode === "file" ? !!file : !!value.trim();

  return (
    <div className="rounded-xl border-2 border-dashed border-border bg-card p-6 space-y-4">
      <div className="flex gap-2">
        {(["url", "text", "file"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => { 
              setMode(m); 
              setValue(""); 
              setFile(null); 
              setCustomName("");
              setTags([]);
              setTagInput("");
            }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              mode === m
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {m === "url" && <Link className="h-3 w-3" />}
            {m === "text" && <FileText className="h-3 w-3" />}
            {m === "file" && <Upload className="h-3 w-3" />}
            {m.charAt(0).toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "text" ? (
          <textarea
            placeholder="Paste any text, notes, or ideas..."
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={4}
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        ) : mode === "url" ? (
          <input
            type="url"
            placeholder="https://example.com/article"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
        ) : (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragging(false);
              const f = e.dataTransfer.files[0];
              if (f) pickFile(f);
            }}
            className={cn(
              "flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-colors cursor-pointer",
              isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            )}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {file ? file.name : "Drop a file or click to browse"}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
              }}
              className="hidden"
            />
          </div>
        )}

        {/* Custom name input */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Name (optional)
          </label>
          <input
            type="text"
            placeholder={getAutoName() || "Will be auto-detected"}
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          />
          <p className="text-xs text-muted-foreground mt-1">
            {mode === "file" 
              ? "Give this file a custom name, or leave blank to use the filename" 
              : mode === "url"
              ? "Give this URL a custom name, or leave blank to use the page title"
              : "Give this text a custom name, or leave blank to auto-generate"}
          </p>
        </div>

        {/* Tags section */}
        <div>
          <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-1.5">
            <Tag className="h-3 w-3" />
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
              className="flex-1 rounded-md border border-border bg-background px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-primary"
            />
            <button
              type="button"
              onClick={() => addTag(tagInput)}
              disabled={!tagInput.trim()}
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
                  className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 hover:bg-accent hover:text-foreground transition-colors"
                >
                  +{tag}
                </button>
              ))}
          </div>
        </div>

        {/* Folder picker */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5">
            Save to folder (optional)
          </label>
          <FolderPicker
            folders={folders ?? []}
            selectedId={folderId}
            onSelect={setFolderId}
            placeholder="No folder (Inbox)"
          />
        </div>

        {error && (
          <div className="text-xs text-destructive bg-destructive/10 rounded-md px-3 py-2">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={!canSubmit || loading}
          className="w-full rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </form>
    </div>
  );
}
