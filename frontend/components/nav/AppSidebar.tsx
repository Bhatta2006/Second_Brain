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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const NAV_ITEMS = [
  { href: "/inbox", icon: Inbox, label: "Inbox" },
  { href: "/library", icon: BookOpen, label: "Library" },
  { href: "/graph", icon: Network, label: "Graph" },
  { href: "/search", icon: Search, label: "Search" },
  { href: "/chat", icon: MessageCircle, label: "Chat" },
];

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
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
      <Sidebar {...props}>
        <SidebarHeader className="px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <BookOpen className="size-4" />
            </div>
            <span className="text-lg font-bold">SecondBrain</span>
          </div>
        </SidebarHeader>

        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV_ITEMS.map(({ href, icon: Icon, label }) => (
                  <SidebarMenuItem key={href}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith(href)}
                      tooltip={label}
                    >
                      <Link href={href}>
                        <Icon className="size-4" />
                        <span>{label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          {/* Folders section */}
          <SidebarGroup>
            <SidebarGroupLabel asChild>
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
            </SidebarGroupLabel>

            {foldersExpanded && (
              <SidebarGroupContent className="mt-2">
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
              </SidebarGroupContent>
            )}
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4 border-t border-sidebar-border">
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              <AvatarFallback className="text-xs">
                {user?.email?.charAt(0).toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="shrink-0"
            >
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <FolderDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={handleSubmitFolder}
        folder={editingFolder}
      />
    </>
  );
}
