"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { itemsApi, foldersApi } from "@/lib/api";
import { UploadOptionsDialog, type Destination } from "./UploadOptionsDialog";
import { SPRING, EASE_OUT } from "@/components/ui/motion";

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

  /** Resolve a Destination into the concrete fields the API needs.
   *  Creating a new folder happens here (one folders.create call). */
  async function resolveDestination(
    dest?: Destination
  ): Promise<{ folderId?: string; aiOrganise: boolean }> {
    if (!dest || dest.kind === "ai") return { aiOrganise: true };
    if (dest.kind === "existing") return { folderId: dest.folderId, aiOrganise: false };
    if (dest.kind === "new") {
      const folder = await foldersApi.create({ name: dest.folderName });
      return { folderId: folder.id, aiOrganise: false };
    }
    return { aiOrganise: false }; // "none" → uncategorised
  }

  async function doFileUpload(
    titleOverride?: string,
    tagsOverride?: string[],
    dest?: Destination
  ) {
    if (!file) return;
    setShowOptions(false);
    setError(null);
    setLoading(true);
    try {
      const { folderId, aiOrganise } = await resolveDestination(dest);
      const res = await itemsApi.upload(file, folderId, titleOverride, tagsOverride, aiOrganise);
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
    tagsOverride?: string[],
    dest?: Destination
  ) {
    setPendingIngest(null);
    setShowOptions(false);
    setError(null);
    setLoading(true);
    try {
      const { folderId, aiOrganise } = await resolveDestination(dest);
      const res = await itemsApi.ingest({
        type: ingestMode,
        ...(ingestMode === "url" ? { url: ingestValue } : { text: ingestValue }),
        ...(folderId ? { hint_folder_id: folderId } : {}),
        metadata: {
          ...(titleOverride ? { title: titleOverride } : {}),
          ...(tagsOverride?.length ? { tags: tagsOverride, user_set_tags: true } : {}),
          ...(aiOrganise ? { ai_organise: true } : {}),
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
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border border-border bg-card p-6 space-y-4 shadow-soft transition-all duration-300",
          isDragging && mode === "file" && "border-brand/60 shadow-brand"
        )}
      >
        {/* subtle dotted texture */}
        <div aria-hidden className="bg-dots pointer-events-none absolute inset-0 opacity-[0.4]" />

        {/* Mode tabs */}
        <div className="relative flex gap-1 p-1 bg-muted rounded-xl w-fit">
          {MODES.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => { setMode(key); setValue(""); setFile(null); setError(null); }}
              className={cn(
                "relative flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors duration-200",
                mode === key
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {mode === key && (
                <motion.span
                  layoutId="upload-mode-pill"
                  className="absolute inset-0 rounded-lg bg-background shadow-soft"
                  transition={SPRING}
                />
              )}
              <Icon className="relative h-3.5 w-3.5" />
              <span className="relative">{label}</span>
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: EASE_OUT }}
            >
              {mode === "text" ? (
                <textarea
                  placeholder="Paste any text, notes, or ideas…"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/40"
                />
              ) : mode === "url" ? (
                <input
                  type="url"
                  placeholder="https://example.com/article"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className="w-full rounded-xl border border-input bg-background px-3.5 py-2.5 text-sm outline-none transition-shadow focus:ring-2 focus:ring-brand/40"
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
                    "group flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-border py-12 text-sm text-muted-foreground transition-all duration-300 cursor-pointer hover:border-brand/50 hover:bg-brand/[0.04]",
                    isDragging && "border-brand bg-brand/10 scale-[1.01]"
                  )}
                >
                  <Upload
                    className={cn(
                      "h-9 w-9 mb-2.5 text-muted-foreground/50 transition-all duration-300 group-hover:text-brand group-hover:-translate-y-0.5",
                      isDragging && "text-brand -translate-y-1 scale-110"
                    )}
                  />
                  <p className="font-medium text-foreground/80">
                    Drop a file here or <span className="text-brand underline decoration-brand/40 underline-offset-2">browse</span>
                  </p>
                  <p className="text-xs mt-1 text-muted-foreground/70">PDF, images, audio, video, text — up to 25 MB</p>
                  {file && (
                    <motion.p
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={SPRING}
                      className="mt-4 flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-muted px-3 py-1 text-xs font-medium text-brand"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {file.name}
                    </motion.p>
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
            </motion.div>
          </AnimatePresence>

          <AnimatePresence>
            {error && (
              <motion.p
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-1.5 text-xs text-destructive"
              >
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />
                {error}
              </motion.p>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading || !canSubmit}
            className={cn(
              "w-full rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-soft transition-all duration-200 hover:opacity-90 hover:shadow-lift active:scale-[0.99]",
              (loading || !canSubmit) && "opacity-50 cursor-not-allowed hover:shadow-soft"
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-3.5 w-3.5 rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground animate-spin" />
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
          onSave={(title, tags, dest) => doFileUpload(title, tags, dest)}
          onSkip={() => doFileUpload(undefined, undefined, { kind: "ai" })}
          onClose={() => setShowOptions(false)}
        />
      )}

      {/* Options dialog for URL/text */}
      {showOptions && pendingIngest && (
        <UploadOptionsDialog
          defaultTitle={pendingIngest.defaultTitle}
          onSave={(title, tags, dest) =>
            doIngest(pendingIngest.mode, pendingIngest.value, title, tags, dest)
          }
          onSkip={() =>
            doIngest(pendingIngest.mode, pendingIngest.value, undefined, undefined, { kind: "ai" })
          }
          onClose={() => { setShowOptions(false); setPendingIngest(null); }}
        />
      )}
    </>
  );
}
