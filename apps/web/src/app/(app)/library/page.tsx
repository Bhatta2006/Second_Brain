"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, FolderIcon } from "lucide-react";
import { itemsApi, foldersApi, type Item, type Folder } from "@/lib/api";
import { ItemCard } from "@/components/items/ItemCard";
import { cn } from "@/lib/utils";

function FolderNode({
  folder,
  selectedId,
  onSelect,
}: {
  folder: Folder;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const hasChildren = folder.children.length > 0;

  return (
    <div>
      <button
        onClick={() => {
          onSelect(folder.id);
          if (hasChildren) setOpen(!open);
        }}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          selectedId === folder.id
            ? "bg-accent font-medium"
            : "hover:bg-muted text-muted-foreground"
        )}
        style={{ paddingLeft: `${8 + folder.depth * 16}px` }}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronRight className="h-3 w-3 shrink-0" />
          )
        ) : (
          <span className="w-3" />
        )}
        <span className="mr-1">{folder.emoji ?? "📁"}</span>
        <span className="flex-1 text-left truncate">{folder.name}</span>
        <span className="text-xs opacity-50">{folder.item_count}</span>
      </button>

      {open && hasChildren && (
        <div>
          {folder.children.map((child) => (
            <FolderNode
              key={child.id}
              folder={child}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function LibraryPage() {
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: folders } = useQuery({
    queryKey: ["folders"],
    queryFn: () => foldersApi.tree(),
  });

  const { data: items, isLoading } = useQuery({
    queryKey: ["items", { folder_id: selectedFolder }],
    queryFn: () => itemsApi.list({ folder_id: selectedFolder ?? undefined }),
  });

  function handleStar(item: Item) {
    itemsApi.update(item.id, { is_starred: !item.is_starred }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    });
  }

  return (
    <div className="flex h-full">
      {/* Folder sidebar */}
      <div className="w-56 shrink-0 border-r border-border bg-card overflow-y-auto p-2">
        <p className="px-2 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
          Folders
        </p>
        <button
          onClick={() => setSelectedFolder(null)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            selectedFolder === null
              ? "bg-accent font-medium"
              : "hover:bg-muted text-muted-foreground"
          )}
        >
          <FolderIcon className="h-3 w-3 shrink-0" />
          All items
        </button>
        {folders?.map((folder) => (
          <FolderNode
            key={folder.id}
            folder={folder}
            selectedId={selectedFolder}
            onSelect={setSelectedFolder}
          />
        ))}
      </div>

      {/* Item grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-semibold">
            {selectedFolder
              ? folders?.find((f) => f.id === selectedFolder)?.name ?? "Folder"
              : "All items"}
          </h1>
          <span className="text-sm text-muted-foreground">
            {items?.total ?? 0} items
          </span>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-32 rounded-lg bg-muted animate-pulse" />
            ))}
          </div>
        ) : items?.results.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p>No items here yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items?.results.map((item) => (
              <ItemCard key={item.id} item={item} onStar={handleStar} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
