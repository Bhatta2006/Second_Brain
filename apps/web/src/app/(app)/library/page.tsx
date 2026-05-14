"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, ChevronDown, FolderIcon, MoreVertical, Trash2, Edit, Plus, X } from "lucide-react";
import { itemsApi, foldersApi, type Item, type Folder } from "@/lib/api";
import { ItemCard } from "@/components/items/ItemCard";
import { UploadZone } from "@/components/upload/UploadZone";
import { FolderDialog } from "@/components/folders/FolderDialog";
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
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
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
      setFolderMenuOpen(false);
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
              <div className="relative">
                <button
                  onClick={() => setFolderMenuOpen(!folderMenuOpen)}
                  className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {folderMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setFolderMenuOpen(false)} />
                    <div className="absolute left-0 top-full mt-1 w-32 bg-popover border border-border rounded-md shadow-lg z-20 py-1">
                      <button
                        onClick={() => {
                          setEditingFolder(activeFolderData);
                          setDialogOpen(true);
                          setFolderMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left"
                      >
                        <Edit className="h-3.5 w-3.5" />
                        Rename
                      </button>
                      <button
                        onClick={handleDeleteFolder}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-accent text-left text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground hidden sm:inline-block">
              {items?.total ?? 0} items
            </span>
            <button
              onClick={() => setIsUploadOpen(!isUploadOpen)}
              className="flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {isUploadOpen ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {isUploadOpen ? "Close" : "Add Item"}
            </button>
          </div>
        </div>

        {isUploadOpen && (
          <div className="mb-6">
            <UploadZone
              defaultFolderId={selectedFolder}
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
