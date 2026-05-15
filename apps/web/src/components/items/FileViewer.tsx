"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { type Item } from "@/lib/api";
import { FileContent } from "./FileContent";

type Props = {
  item: Item;
  onClose: () => void;
};

/** Modal wrapper around FileContent — used by the inbox detail panel. */
export function FileViewer({ item, onClose }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = item.title ?? item.ai_title ?? "File";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">
              {item.mime_type ?? item.content_type}
              {item.file_size != null && ` · ${formatBytes(item.file_size)}`}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 hover:bg-muted" title="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto bg-muted/30 p-4">
          <FileContent item={item} />
        </div>
      </div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
