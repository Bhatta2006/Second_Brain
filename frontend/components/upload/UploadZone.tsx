"use client";

import { useState, useRef, useEffect } from "react";
import { Upload, Link, FileText, Tag, Plus, X } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { itemsApi, foldersApi } from "@/lib/api";
import { FolderPicker } from "@/components/folders/FolderPicker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

type Mode = "file" | "url" | "text";

type Props = {
  onSuccess?: () => void;
  defaultFolderId?: string | null;
};

const SUGGESTED_TAGS = [
  "work",
  "personal",
  "research",
  "ideas",
  "reference",
  "project",
  "learning",
  "finance",
  "health",
  "travel",
  "recipes",
  "bookmarks",
  "notes",
  "archive",
  "important",
];

export function UploadZone({ onSuccess, defaultFolderId }: Props) {
  const [mode, setMode] = useState<Mode>("url");
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [customName, setCustomName] = useState("");
  const [folderId, setFolderId] = useState<string | null>(
    defaultFolderId ?? null,
  );

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

  function getAutoName(): string {
    if (mode === "file" && file) {
      return file.name.replace(/\.[^/.]+$/, "");
    } else if (mode === "url" && value) {
      try {
        const url = new URL(value);
        const pathname =
          url.pathname.split("/").filter(Boolean).pop() || url.hostname;
        return pathname.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      } catch {
        return "";
      }
    } else if (mode === "text" && value) {
      return value.trim().substring(0, 50).replace(/\s+/g, " ");
    }
    return "";
  }

  function pickFile(f: File) {
    setFile(f);
    setValue(f.name);
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
      reader.readAsDataURL(f);
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
        const isTextFile =
          file.type.startsWith("text/") ||
          file.name.endsWith(".txt") ||
          file.name.endsWith(".md") ||
          file.name.endsWith(".csv") ||
          file.name.endsWith(".json");

        if (isTextFile && file.size < 2 * 1024 * 1024) {
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
      onSuccess?.();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = mode === "file" ? !!file : !!value.trim();

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as Mode);
            setValue("");
            setFile(null);
            setCustomName("");
            setTags([]);
            setTagInput("");
          }}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="url">
              <Link className="h-4 w-4 mr-2" />
              URL
            </TabsTrigger>
            <TabsTrigger value="text">
              <FileText className="h-4 w-4 mr-2" />
              Text
            </TabsTrigger>
            <TabsTrigger value="file">
              <Upload className="h-4 w-4 mr-2" />
              File
            </TabsTrigger>
          </TabsList>

          <form onSubmit={handleSubmit} className="space-y-3 mt-4">
            {mode === "text" ? (
              <textarea
                placeholder="Paste any text, notes, or ideas..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={4}
                className={cn(
                  "w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm",
                  "placeholder:text-muted-foreground",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                )}
              />
            ) : mode === "url" ? (
              <Input
                type="url"
                placeholder="https://example.com/article"
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) pickFile(f);
                }}
                className={cn(
                  "flex flex-col items-center justify-center rounded-md border-2 border-dashed p-8 transition-colors cursor-pointer",
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/50",
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Name (optional)
              </Label>
              <Input
                type="text"
                placeholder={getAutoName() || "Will be auto-detected"}
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                {mode === "file"
                  ? "Give this file a custom name, or leave blank to use the filename"
                  : mode === "url"
                    ? "Give this URL a custom name, or leave blank to use the page title"
                    : "Give this text a custom name, or leave blank to auto-generate"}
              </p>
            </div>

            {/* Tags section */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Tag className="h-3 w-3" />
                Tags (optional)
              </Label>

              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
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

              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  placeholder="Type a tag and press Enter"
                  className="text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => addTag(tagInput)}
                  disabled={!tagInput.trim()}
                >
                  <Plus className="h-3 w-3" />
                </Button>
              </div>

              <div className="flex flex-wrap gap-1">
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
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Save to folder (optional)
              </Label>
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

            <Button
              type="submit"
              disabled={!canSubmit || loading}
              className="w-full"
            >
              {loading ? "Saving..." : "Save"}
            </Button>
          </form>
        </Tabs>
      </CardContent>
    </Card>
  );
}
