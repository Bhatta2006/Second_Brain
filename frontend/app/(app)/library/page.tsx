"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, FolderIcon, MoreVertical, Trash2, Edit, Plus, X } from "lucide-react";
import { itemsApi, foldersApi, type Item, type Folder } from "@/lib/api";
import { ItemCard } from "@/components/items/ItemCard";
import { UploadZone } from "@/components/upload/UploadZone";
import { FolderDialog } from "@/components/folders/FolderDialog";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";

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
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: folders } = useQuery({
    queryKey: ["folders"],
    queryFn: () => foldersApi.tree(),
  });

  // Helper to find flat folder by id
  function findFolder(nodes: Folder[], id: string): Folder | null {
    for (const n of nodes) {
      if (n.id === id) return n;
      const found = findFolder(n.children, id);
      if (found) return found;
    }
    return null;
  }
  const activeFolderData = selectedFolder && folders ? findFolder(folders, selectedFolder) : null;

  const { data: items, isLoading } = useQuery({
    queryKey: ["items", { folder_id: selectedFolder }],
    queryFn: () => itemsApi.list({ folder_id: selectedFolder ?? undefined }),
  });

  function handleStar(item: Item) {
    itemsApi.update(item.id, { is_starred: !item.is_starred }).then(() => {
      queryClient.invalidateQueries({ queryKey: ["items"] });
    });
  }

  async function handleDeleteItem(item: Item) {
    if (!confirm(`Delete item "${item.title || 'Untitled'}"?`)) return;
    try {
      await itemsApi.delete(item.id);
      queryClient.invalidateQueries({ queryKey: ["items"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete item");
    }
  }

  async function handleDeleteFolder() {
    if (!activeFolderData) return;
    if (!confirm(`Delete folder "${activeFolderData.name}"? Items will be moved to Inbox.`)) return;
    try {
      await foldersApi.delete(activeFolderData.id);
      setSelectedFolder(null);
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete folder");
    }
  }

  async function handleSubmitFolder(data: { name: string; emoji: string; color: string; tags: string[] }) {
    if (!editingFolder) return;
    const { tags, ...folderData } = data;
    await foldersApi.update(editingFolder.id, folderData);
    queryClient.invalidateQueries({ queryKey: ["folders"] });
    setDialogOpen(false);
    setEditingFolder(null);
  }

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Folder sidebar */}
      <div className="w-56 shrink-0 border-r border-border bg-card overflow-hidden">
        <ScrollArea className="h-full p-2">
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
        </ScrollArea>
      </div>

      {/* Item grid */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold flex items-center gap-2">
              {activeFolderData ? (
                <>
                  {activeFolderData.emoji && <span>{activeFolderData.emoji}</span>}
                  {activeFolderData.name}
                </>
              ) : (
                "All items"
              )}
            </h1>
            
            {activeFolderData && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => {
                    setEditingFolder(activeFolderData);
                    setDialogOpen(true);
                  }}>
                    <Edit className="h-3.5 w-3.5 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleDeleteFolder} className="text-destructive">
                    <Trash2 className="h-3.5 w-3.5 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline-block">
              {items?.total ?? 0} items
            </span>
            <Button onClick={() => setIsUploadOpen(!isUploadOpen)}>
              {isUploadOpen ? <X className="h-4 w-4 mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              {isUploadOpen ? "Close" : "Add Item"}
            </Button>
          </div>
        </div>

        {isUploadOpen && (
          <div className="mb-6">
            <UploadZone
              onSuccess={() => {
                queryClient.invalidateQueries({ queryKey: ["items"] });
                setIsUploadOpen(false);
              }}
            />
          </div>
        )}

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
              <ItemCard key={item.id} item={item} onStar={handleStar} onDelete={handleDeleteItem} />
            ))}
          </div>
        )}
      </div>

      <FolderDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingFolder(null);
        }}
        onSubmit={handleSubmitFolder}
        folder={editingFolder ?? undefined}
      />
    </div>
  );
}
