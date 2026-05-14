"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Inbox,
  BookOpen,
  Network,
  Search,
  MessageCircle,
  LogOut,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { foldersApi, type Folder } from "@/lib/api";
import { FolderTree } from "@/components/folders/FolderTree";
import { FolderDialog } from "@/components/folders/FolderDialog";

const NAV_ITEMS = [
  { href: "/inbox", icon: Inbox, label: "Inbox" },
  { href: "/library", icon: BookOpen, label: "Library" },
  { href: "/graph", icon: Network, label: "Graph" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/chat", icon: MessageCircle, label: "Chat" },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { signOut, user } = useAuthStore();
  const queryClient = useQueryClient();
  
  const [foldersExpanded, setFoldersExpanded] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [parentId, setParentId] = useState<string | undefined>(undefined);

  const { data: folders } = useQuery({
    queryKey: ["folders"],
    queryFn: () => foldersApi.tree(),
  });

  function handleCreateFolder(parent?: string) {
    setParentId(parent);
    setEditingFolder(null);
    setDialogOpen(true);
  }

  function handleEditFolder(folder: Folder) {
    setEditingFolder(folder);
    setParentId(undefined);
    setDialogOpen(true);
  }

  async function handleDeleteFolder(folder: Folder) {
    if (!confirm(`Delete "${folder.name}"? Items will be moved to Inbox.`)) return;
    try {
      await foldersApi.delete(folder.id);
      queryClient.invalidateQueries({ queryKey: ["folders"] });
      queryClient.invalidateQueries({ queryKey: ["items"] });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete folder");
    }
  }

  async function handleSubmitFolder(data: { name: string; emoji: string; color: string; tags: string[] }) {
    // Note: This function is awaited by FolderDialog. If it throws,
    // FolderDialog shows the error inline. If it succeeds, FolderDialog closes.
    // Strip tags — the backend FolderCreate schema doesn't support tags yet.
    const { tags, ...folderData } = data;
    if (editingFolder) {
      await foldersApi.update(editingFolder.id, folderData);
    } else {
      await foldersApi.create({ ...folderData, parent_id: parentId });
    }
    queryClient.invalidateQueries({ queryKey: ["folders"] });
    queryClient.invalidateQueries({ queryKey: ["items"] });
    setDialogOpen(false);
  }

  function handleFolderSelect(id: string | null) {
    if (id) {
      router.push(`/library?folder=${id}`);
    } else {
      router.push("/library");
    }
  }

  return (
    <>
      <aside className="flex flex-col w-56 h-full border-r border-border bg-card px-3 py-4 shrink-0">
        <div className="mb-6 px-2">
          <span className="text-lg font-bold">SecondBrain</span>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                pathname.startsWith(href)
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          ))}

          {/* Folders section */}
          <div className="pt-4 mt-4 border-t border-border">
            <button
              onClick={() => setFoldersExpanded(!foldersExpanded)}
              className="flex w-full items-center gap-2 px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              {foldersExpanded ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
              Folders
            </button>

            {foldersExpanded && (
              <div className="mt-2">
                <FolderTree
                  folders={folders ?? []}
                  selectedId={null}
                  onSelect={handleFolderSelect}
                  onCreateFolder={handleCreateFolder}
                  onEditFolder={handleEditFolder}
                  onDeleteFolder={handleDeleteFolder}
                  showActions={true}
                  compact={true}
                />
              </div>
            )}
          </div>
        </nav>

        <div className="mt-auto pt-4 border-t border-border">
          <div className="px-2 mb-2 truncate text-xs text-muted-foreground">
            {user?.email}
          </div>
          <button
            onClick={signOut}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>

      <FolderDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmitFolder}
        folder={editingFolder}
      />
    </>
  );
}
