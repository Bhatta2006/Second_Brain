"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { type Item } from "@/lib/api";
import { FileContent } from "./FileContent";
import { SPRING, EASE_OUT } from "@/components/ui/motion";

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
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: EASE_OUT }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm sm:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={SPRING}
          className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-border bg-card text-card-foreground shadow-lift"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3.5">
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold">{title}</p>
              <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                {item.mime_type ?? item.content_type}
                {item.file_size != null && ` · ${formatBytes(item.file_size)}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto bg-muted/30 p-4">
            <FileContent item={item} />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
