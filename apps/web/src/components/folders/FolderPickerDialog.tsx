"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderIcon, Inbox } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { foldersApi, type Folder } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SPRING, EASE_OUT } from "@/components/ui/motion";

type Props = {
  open: boolean;
  title: string;
  /** Folder id to disable (and hide its subtree) — used when moving a folder into itself. */
  disabledFolderId?: string;
  onPick: (folderId: string | null) => void;
  onClose: () => void;
};

function FolderRow({
  folder,
  depth,
  disabledFolderId,
  onPick,
}: {
  folder: Folder;
  depth: number;
  disabledFolderId?: string;
  onPick: (id: string | null) => void;
}) {
  const disabled = folder.id === disabledFolderId;
  if (disabled) return null; // hide the whole subtree we can't move into

  return (
    <>
      <button
        onClick={() => onPick(folder.id)}
        className="group flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
        style={{ paddingLeft: `${10 + depth * 16}px` }}
      >
        <span className="shrink-0">{folder.emoji ?? "📁"}</span>
        <span className="flex-1 text-left truncate">{folder.name}</span>
        <span className="font-mono text-[11px] text-muted-foreground">{folder.item_count}</span>
      </button>
      {folder.children.map((child) => (
        <FolderRow
          key={child.id}
          folder={child}
          depth={depth + 1}
          disabledFolderId={disabledFolderId}
          onPick={onPick}
        />
      ))}
    </>
  );
}

export function FolderPickerDialog({ open, title, disabledFolderId, onPick, onClose }: Props) {
  const { data: folders } = useQuery({
    queryKey: ["folders"],
    queryFn: () => foldersApi.tree(),
    enabled: open,
  });

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/60 p-4 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: 6 }}
            transition={SPRING}
            className="w-full max-w-sm overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-lift"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <FolderIcon className="h-4 w-4 text-brand" />
              <h2 className="font-display text-sm font-semibold">{title}</h2>
            </div>
            <div className="max-h-80 overflow-auto p-2">
              <button
                onClick={() => onPick(null)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-foreground hover:bg-accent transition-colors"
                )}
              >
                <Inbox className="h-4 w-4 text-muted-foreground" />
                <span className="flex-1 text-left">Uncategorised (no folder)</span>
              </button>
              {folders?.length === 0 && (
                <p className="px-2 py-4 text-center text-xs text-muted-foreground">
                  No folders yet. Create one first.
                </p>
              )}
              {folders?.map((folder) => (
                <FolderRow
                  key={folder.id}
                  folder={folder}
                  depth={0}
                  disabledFolderId={disabledFolderId}
                  onPick={onPick}
                />
              ))}
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
              <button
                onClick={onClose}
                className="rounded-lg border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
