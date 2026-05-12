"use client";

import { useState, useRef } from "react";
import { Upload, Link, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { itemsApi } from "@/lib/api";

type Mode = "file" | "url" | "text";

type Props = {
  onSuccess?: (itemId: string) => void;
};

export function UploadZone({ onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("url");
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File) {
    setFile(f);
    setValue(f.name);
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
      if (mode === "file" && file) {
        const content = await readFileAsText(file);
        res = await itemsApi.ingest({
          type: "text",
          text: content,
          metadata: { filename: file.name },
        });
      } else {
        res = await itemsApi.ingest({
          type: mode === "file" ? "text" : mode,
          ...(mode === "url" ? { url: value } : { text: value }),
        });
      }
      setValue("");
      setFile(null);
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
            onClick={() => { setMode(m); setValue(""); setFile(null); }}
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
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex flex-col items-center justify-center rounded-md border-2 border-dashed border-border py-8 text-sm text-muted-foreground transition-colors cursor-pointer",
              isDragging && "border-primary bg-primary/5"
            )}
          >
            <Upload className="h-8 w-8 mb-2 opacity-50" />
            <p>Drop a file here or <span className="text-primary underline">browse</span></p>
            {file && <p className="mt-2 text-xs text-primary font-medium">{file.name}</p>}
            <input
              ref={fileInputRef}
              type="file"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pickFile(f);
              }}
            />
          </div>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}

        <button
          type="submit"
          disabled={loading || !canSubmit}
          className={cn(
            "w-full rounded-md bg-primary py-2 text-sm font-semibold text-primary-foreground transition-opacity",
            (loading || !canSubmit) && "opacity-50 cursor-not-allowed"
          )}
        >
          {loading ? "Saving..." : "Save to SecondBrain"}
        </button>
      </form>
    </div>
  );
}
