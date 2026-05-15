"use client";

import { useState, useRef } from "react";
import { Upload, Link, FileText, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { itemsApi } from "@/lib/api";
import { UploadOptionsDialog } from "./UploadOptionsDialog";

type Mode = "file" | "url" | "text";

type Props = {
  onSuccess?: (itemId: string) => void;
};

type PendingIngest = {
  mode: "url" | "text";
  value: string;
  defaultTitle: string;
};

function urlToTitle(url: string): string {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ? decodeURIComponent(last).replace(/[-_]/g, " ") : u.hostname;
  } catch {
    return "";
  }
}

export function UploadZone({ onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>("url");
  const [value, setValue] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [pendingIngest, setPendingIngest] = useState<PendingIngest | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function pickFile(f: File) {
    setFile(f);
    setValue(f.name);
  }

  async function doFileUpload(titleOverride?: string, tagsOverride?: string[]) {
    if (!file) return;
    setShowOptions(false);
    setError(null);
    setLoading(true);
    try {
      const res = await itemsApi.upload(file, undefined, titleOverride, tagsOverride);
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

  async function doIngest(
    ingestMode: "url" | "text",
    ingestValue: string,
    titleOverride?: string,
    tagsOverride?: string[]
  ) {
    setPendingIngest(null);
    setShowOptions(false);
    setError(null);
    setLoading(true);
    try {
      const res = await itemsApi.ingest({
        type: ingestMode,
        ...(ingestMode === "url" ? { url: ingestValue } : { text: ingestValue }),
        metadata: {
          ...(titleOverride ? { title: titleOverride } : {}),
          ...(tagsOverride?.length ? { tags: tagsOverride, user_set_tags: true } : {}),
        },
      });
      setValue("");
      onSuccess?.(res.item_id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save item");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim() && !file) return;

    if (mode === "file" && file) {
      setShowOptions(true);
      return;
    }

    // For URL/text, show options dialog too
    const defaultTitle =
      mode === "url" ? urlToTitle(value) : value.trim().slice(0, 60);
    setPendingIngest({ mode: mode as "url" | "text", value, defaultTitle });
    setShowOptions(true);
  }

  const canSubmit = mode === "file" ? !!file : !!value.trim();

  const MODES: { key: Mode; label: string; icon: React.ElementType }[] = [
    { key: "url", label: "URL", icon: Globe },
    { key: "text", label: "Text", icon: FileText },
    { key: "file", label: "File", icon: Upload },
  ];

  return (
    <>
      <div className="rounded-xl border-2 border-dashed border-border bg-card p-6 space-y-4 transition-colors">
        {/* Mode tabs */}
        <div className="flex gap-1.5 p-1 bg-muted rounded-lg w-fit">
          {MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setMode(key); setValue(""); setFile(null); setError(null); }}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all duration-150",
                mode === key
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "text" ? (
            <textarea
              placeholder="Paste any text, notes, or ideas…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={4}
              className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
            />
          ) : mode === "url" ? (
            <input
              type="url"
              placeholder="https://example.com/article"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/50 transition-shadow"
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
                "flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-border py-10 text-sm text-muted-foreground transition-all duration-200 cursor-pointer hover:border-primary/50 hover:bg-primary/5",
                isDragging && "border-primary bg-primary/10 scale-[1.01]"
              )}
            >
              <Upload className={cn("h-9 w-9 mb-2 opacity-40 transition-transform duration-200", isDragging && "opacity-70 -translate-y-1")} />
              <p className="font-medium">Drop a file here or <span className="text-primary underline">browse</span></p>
              <p className="text-xs mt-1 opacity-60">PDF, images, audio, video, text — up to 25 MB</p>
              {file && (
                <p className="mt-3 flex items-center gap-1.5 text-xs text-primary font-medium bg-primary/10 px-3 py-1 rounded-full">
                  <FileText className="h-3.5 w-3.5" />
                  {file.name}
                </p>
              )}
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

          {error && (
            <p className="flex items-center gap-1.5 text-xs text-red-500">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className={cn(
              "w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-all duration-150 hover:opacity-90 active:scale-[0.99]",
              (loading || !canSubmit) && "opacity-50 cursor-not-allowed"
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                Saving…
              </span>
            ) : (
              "Save to SecondBrain"
            )}
          </button>
        </form>
      </div>

      {/* Options dialog for file uploads */}
      {showOptions && file && mode === "file" && (
        <UploadOptionsDialog
          defaultTitle={file.name}
          onSave={(title, tags) => doFileUpload(title, tags)}
          onSkip={() => doFileUpload()}
          onClose={() => setShowOptions(false)}
        />
      )}

      {/* Options dialog for URL/text */}
      {showOptions && pendingIngest && (
        <UploadOptionsDialog
          defaultTitle={pendingIngest.defaultTitle}
          onSave={(title, tags) => doIngest(pendingIngest.mode, pendingIngest.value, title, tags)}
          onSkip={() => doIngest(pendingIngest.mode, pendingIngest.value)}
          onClose={() => { setShowOptions(false); setPendingIngest(null); }}
        />
      )}
    </>
  );
}
