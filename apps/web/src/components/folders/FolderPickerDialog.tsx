"use client";

import { useQuery } from "@tanstack/react-query";
import { FolderIcon, Inbox } from "lucide-react";
import { foldersApi, type Folder } from "@/lib/api";
import { cn } from "@/lib/utils";

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
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <span>{folder.emoji ?? "📁"}</span>
        <span className="flex-1 text-left truncate">{folder.name}</span>
        <span className="text-xs text-muted-foreground">{folder.item_count}</span>
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

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
        </div>
        <div className="max-h-80 overflow-auto p-2">
          <button
            onClick={() => onPick(null)}
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted transition-colors"
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
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-muted"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
